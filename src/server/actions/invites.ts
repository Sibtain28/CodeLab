"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { SetupRequiredError } from "../config";
import { getDb } from "../db";
import { AccessError, getCurrentUser, requireProjectAccess } from "../dal";
import { INVITE_TTL_MS, MAX_ACTIVE_INVITES, expiresLabel, hashInviteToken, isInviteToken, newInviteToken } from "../invites";
import { rateLimit } from "../rate-limit";

export interface InviteSummary {
  id: string;
  role: "Editor" | "Viewer";
  createdBy: string;
  expires: string;
  uses: number;
}

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof SetupRequiredError) return { ok: false, error: "The database isn't configured yet." };
  if (error instanceof AccessError) {
    if (error.reason === "unauthenticated") return { ok: false, error: "Your session has ended. Sign in again." };
    if (error.reason === "forbidden") return { ok: false, error: "Only the project owner can manage invite links." };
    return { ok: false, error: "Project not found." };
  }
  // Setup problems get an actionable message instead of a generic one.
  if (error instanceof Prisma.PrismaClientKnownRequestError && (error.code === "P2021" || error.code === "P2022")) {
    console.error(`invite action failed: database schema is behind (${error.code}). Run \`npx prisma migrate dev\`.`);
    return { ok: false, error: "The database is missing the latest migration. Run `npx prisma migrate dev`, then restart the dev server." };
  }
  if (!("projectInvite" in getDb())) {
    console.error("invite action failed: the Prisma client is out of date. Run `npx prisma generate`.");
    return { ok: false, error: "The server's database client is out of date. Run `npx prisma migrate dev`, then restart the dev server." };
  }
  console.error("invite action failed", error instanceof Error ? `${error.name}${"code" in error ? ` ${String(error.code)}` : ""}` : "");
  return { ok: false, error: "Something went wrong. Please try again." };
}

/** Owner-only: every invite action re-checks this on the server. */
async function requireOwner(projectId: unknown) {
  const access = await requireProjectAccess(projectId);
  if (access.role !== "OWNER") throw new AccessError("forbidden");
  return access;
}

async function activeInvites(projectId: string): Promise<InviteSummary[]> {
  const now = new Date();
  const rows = await getDb().projectInvite.findMany({
    where: { projectId, revokedAt: null, expiresAt: { gt: now } },
    orderBy: { createdAt: "desc" },
    select: { id: true, role: true, uses: true, expiresAt: true, createdBy: { select: { name: true } } },
  });
  return rows.map((r) => ({
    id: r.id,
    role: r.role === "VIEWER" ? "Viewer" : "Editor",
    createdBy: r.createdBy.name,
    expires: expiresLabel(r.expiresAt, now),
    uses: r.uses,
  }));
}

export async function listInvites(projectId: unknown): Promise<Result<{ invites: InviteSummary[] }>> {
  try {
    const { projectId: id } = await requireOwner(projectId);
    return { ok: true, invites: await activeInvites(id) };
  } catch (error) {
    return failure(error);
  }
}

const createSchema = z.object({ projectId: z.string().max(64), role: z.enum(["EDITOR", "VIEWER"]) });

/** Creates a link. The token is returned once and never stored in plain text. */
export async function createInvite(input: unknown): Promise<Result<{ path: string; invites: InviteSummary[] }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const { user, projectId } = await requireOwner(parsed.data.projectId);
    const db = getDb();
    const active = await db.projectInvite.count({ where: { projectId, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (active >= MAX_ACTIVE_INVITES) {
      return { ok: false, error: `You already have ${MAX_ACTIVE_INVITES} active links. Revoke one first.` };
    }
    const token = newInviteToken();
    await db.projectInvite.create({
      data: {
        projectId,
        tokenHash: hashInviteToken(token),
        role: parsed.data.role,
        createdById: user.id,
        expiresAt: new Date(Date.now() + INVITE_TTL_MS),
      },
    });
    return { ok: true, path: `/join/${token}`, invites: await activeInvites(projectId) };
  } catch (error) {
    return failure(error);
  }
}

const revokeSchema = z.object({ projectId: z.string().max(64), inviteId: z.string().max(64) });

export async function revokeInvite(input: unknown): Promise<Result<{ invites: InviteSummary[] }>> {
  const parsed = revokeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const { projectId } = await requireOwner(parsed.data.projectId);
    // Scoped to this project, so an id from another project matches nothing.
    await getDb().projectInvite.updateMany({
      where: { id: parsed.data.inviteId, projectId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return { ok: true, invites: await activeInvites(projectId) };
  } catch (error) {
    return failure(error);
  }
}

export interface AcceptInviteState {
  error?: string;
}

/** Joins the project behind a valid invite, then opens its workspace. */
export async function acceptInvite(_prev: AcceptInviteState | null, form: FormData): Promise<AcceptInviteState> {
  const token = form.get("token");
  if (!isInviteToken(token)) return { error: "This invite link isn't valid." };

  let projectId: string;
  try {
    const user = await getCurrentUser();
    if (!user) return { error: "Your session has ended. Sign in again." };
    const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
    const limit = rateLimit(`join:${user.id}:${ip}`, 20, 10 * 60_000);
    if (!limit.ok) return { error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` };

    const db = getDb();
    const result = await db.$transaction(async (tx) => {
      const invite = await tx.projectInvite.findUnique({
        where: { tokenHash: hashInviteToken(token) },
        select: { id: true, projectId: true, role: true, expiresAt: true, revokedAt: true },
      });
      if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) return null;
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId: invite.projectId, userId: user.id } },
        select: { role: true },
      });
      if (!existing) {
        await tx.projectMember.create({ data: { projectId: invite.projectId, userId: user.id, role: invite.role } });
        await tx.projectInvite.update({ where: { id: invite.id }, data: { uses: { increment: 1 } } });
      } else if (existing.role === "VIEWER" && invite.role === "EDITOR") {
        // An editor link upgrades a viewer; links never downgrade anyone.
        await tx.projectMember.update({
          where: { projectId_userId: { projectId: invite.projectId, userId: user.id } },
          data: { role: "EDITOR" },
        });
      }
      return invite.projectId;
    });
    if (!result) return { error: "This invite link has expired or was revoked. Ask the project owner for a new one." };
    projectId = result;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { error: "You're already a member. Refresh to open the project." };
    }
    return { error: failure(error).error };
  }
  redirect(`/workspace/${projectId}`);
}
