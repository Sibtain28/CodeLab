import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { getDb } from "./db";
import { roleLabel } from "./projects";

/** Invite links stay valid for 7 days unless revoked. */
export const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;
export const MAX_ACTIVE_INVITES = 20;

/** 32 random bytes → 43 base64url characters. */
const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && TOKEN.test(value);
}

export function newInviteToken() {
  return randomBytes(32).toString("base64url");
}

/** Only this hash is stored, so a database leak doesn't expose usable links. */
export function hashInviteToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function expiresLabel(at: Date, now = new Date()) {
  const ms = at.getTime() - now.getTime();
  const days = Math.round(ms / 86_400_000);
  if (days >= 1) return `in ${days} day${days === 1 ? "" : "s"}`;
  const hours = Math.max(1, Math.round(ms / 3_600_000));
  return `in ${hours} h`;
}

export interface InvitePreview {
  status: "valid" | "invalid" | "member";
  projectId?: string;
  projectName?: string;
  ownerName?: string;
  role?: "Editor" | "Viewer";
  expires?: string;
}

/**
 * Read-only lookup for the /join page. Not a server action: it's only
 * called from that page, after the session has been verified.
 */
export async function previewInvite(token: string, userId: string): Promise<InvitePreview> {
  if (!isInviteToken(token)) return { status: "invalid" };
  const invite = await getDb().projectInvite.findUnique({
    where: { tokenHash: hashInviteToken(token) },
    select: {
      role: true,
      expiresAt: true,
      revokedAt: true,
      project: {
        select: {
          id: true,
          name: true,
          owner: { select: { name: true } },
          members: { where: { userId }, select: { id: true } },
        },
      },
    },
  });
  if (!invite || invite.revokedAt || invite.expiresAt <= new Date()) return { status: "invalid" };
  return {
    status: invite.project.members.length ? "member" : "valid",
    projectId: invite.project.id,
    projectName: invite.project.name,
    ownerName: invite.project.owner.name,
    role: roleLabel[invite.role] === "Viewer" ? "Viewer" : "Editor",
    expires: expiresLabel(invite.expiresAt),
  };
}
