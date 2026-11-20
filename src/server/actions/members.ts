"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { RoomServiceClient } from "livekit-server-sdk";
import { callRoomName } from "@/calls/policy";
import { readLiveKitConfig } from "@/calls/token";
import { SetupRequiredError } from "../config";
import { getDb } from "../db";
import { AccessError, requireProjectAccess } from "../dal";
import {
  listProjectMembersDb,
  updateMemberRoleDb,
  removeProjectMemberDb,
  type ProjectMemberSummary,
} from "../members";

export type { ProjectMemberSummary };

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof SetupRequiredError) return { ok: false, error: "The database isn't configured yet." };
  if (error instanceof AccessError) {
    if (error.reason === "unauthenticated") return { ok: false, error: "Your session has ended. Sign in again." };
    if (error.reason === "forbidden") return { ok: false, error: "Only the project owner can manage members." };
    return { ok: false, error: "Project not found." };
  }
  console.error("member action failed", error instanceof Error ? error.message : "");
  return { ok: false, error: "Something went wrong. Please try again." };
}

async function requireOwner(projectId: unknown) {
  const access = await requireProjectAccess(projectId);
  if (access.role !== "OWNER") throw new AccessError("forbidden");
  return access;
}

const listSchema = z.object({
  projectId: z.string().max(64),
});

/**
 * Lists all project members. Any project member can view the member roster.
 */
export async function listProjectMembers(
  projectId: unknown,
): Promise<Result<{ members: ProjectMemberSummary[]; isOwner: boolean }>> {
  const parsed = listSchema.safeParse({ projectId });
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const { user, projectId: validProjectId, role } = await requireProjectAccess(parsed.data.projectId);
    const members = await listProjectMembersDb(getDb(), validProjectId, user.id);
    return { ok: true, members, isOwner: role === "OWNER" };
  } catch (error) {
    return failure(error);
  }
}

const updateRoleSchema = z.object({
  projectId: z.string().max(64),
  userId: z.string().max(64),
  role: z.enum(["EDITOR", "VIEWER"]),
});

/**
 * Changes a member's role between Editor and Viewer. Owner only.
 */
export async function updateMemberRole(
  input: unknown,
): Promise<Result<{ members: ProjectMemberSummary[] }>> {
  const parsed = updateRoleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    const { user, projectId } = await requireOwner(parsed.data.projectId);
    const db = getDb();
    const result = await updateMemberRoleDb(db, {
      projectId,
      ownerUserId: user.id,
      targetUserId: parsed.data.userId,
      newRole: parsed.data.role,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    revalidatePath(`/workspace/${projectId}`);
    const members = await listProjectMembersDb(db, projectId, user.id);
    return { ok: true, members };
  } catch (error) {
    return failure(error);
  }
}

const removeMemberSchema = z.object({
  projectId: z.string().max(64),
  userId: z.string().max(64),
});

/**
 * Removes a member from the project. Owner only.
 * Disconnects the member from any active workspace call if LiveKit is configured.
 */
export async function removeProjectMember(
  input: unknown,
): Promise<Result<{ members: ProjectMemberSummary[] }>> {
  const parsed = removeMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };

  try {
    const { user, projectId } = await requireOwner(parsed.data.projectId);
    const db = getDb();
    const result = await removeProjectMemberDb(db, {
      projectId,
      ownerUserId: user.id,
      targetUserId: parsed.data.userId,
    });

    if (!result.ok) {
      return { ok: false, error: result.error };
    }

    // Revoke active LiveKit call session if configured and participant is in the room
    try {
      const lk = readLiveKitConfig();
      if (lk.ok) {
        const client = new RoomServiceClient(lk.config.url, lk.config.apiKey, lk.config.apiSecret);
        await client.removeParticipant(callRoomName(projectId), parsed.data.userId);
      }
    } catch {
      // Non-fatal: participant may not be in call or service offline
    }

    revalidatePath(`/workspace/${projectId}`);
    const members = await listProjectMembersDb(db, projectId, user.id);
    return { ok: true, members };
  } catch (error) {
    return failure(error);
  }
}
