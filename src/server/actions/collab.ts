"use server";

import { COLLAB_TOKEN_TTL_MS, signCollabToken } from "@/collab/token";
import { SetupRequiredError, requireConfig } from "../config";
import { AccessError, requireProjectAccess } from "../dal";

export type CollabTokenResult = { ok: true; token: string } | { ok: false; error: string };

/**
 * Issues a short-lived collaboration token for one project, after the same
 * session + membership check every other project action uses. The collab
 * server re-checks membership in the database when the token is used.
 */
export async function getCollabToken(projectId: unknown): Promise<CollabTokenResult> {
  try {
    const { user, projectId: id } = await requireProjectAccess(projectId);
    const { authSecret } = requireConfig();
    const token = signCollabToken({ uid: user.id, pid: id, exp: Date.now() + COLLAB_TOKEN_TTL_MS }, authSecret);
    return { ok: true, token };
  } catch (error) {
    if (error instanceof AccessError) {
      return { ok: false, error: error.reason === "unauthenticated" ? "Your session has ended." : "Project not found." };
    }
    if (error instanceof SetupRequiredError) return { ok: false, error: "The server isn't configured." };
    console.error("getCollabToken failed");
    return { ok: false, error: "Couldn't start live editing." };
  }
}
