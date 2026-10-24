"use server";

import { authorizeCall } from "@/calls/authorize";
import { createCallToken, readLiveKitConfig } from "@/calls/token";
import { SetupRequiredError } from "../config";
import { getDb } from "../db";
import { getCurrentUser } from "../dal";
import { rateLimit } from "../rate-limit";

export type CallTokenResult =
  | { ok: true; token: string; serverUrl: string; roomName: string; canPublish: boolean }
  | {
      ok: false;
      reason: "unauthenticated" | "not_found" | "not_configured" | "rate_limited" | "error";
      error: string;
    };

/**
 * Issues a LiveKit token for the signed-in user to join one workspace's call.
 * Identity, name, room and permissions all come from the server (session +
 * database); the only client input is the project id, which is validated
 * and checked for membership.
 */
export async function getCallToken(projectId: unknown): Promise<CallTokenResult> {
  const live = readLiveKitConfig();
  if (!live.ok) {
    console.warn(`[calls] not configured: ${live.problems.join("; ")}`);
    return { ok: false, reason: "not_configured", error: "Calls aren't set up on this server yet." };
  }
  try {
    const user = await getCurrentUser();
    if (!user) return { ok: false, reason: "unauthenticated", error: "Your session has ended. Sign in again." };

    const limit = rateLimit(`call-token:${user.id}`, 30, 60_000);
    if (!limit.ok) {
      return { ok: false, reason: "rate_limited", error: `Too many attempts. Try again in ${limit.retryAfterSec}s.` };
    }

    const access = await authorizeCall(getDb(), user.id, projectId);
    if (!access.ok) return { ok: false, reason: "not_found", error: "Project not found." };

    const { token, roomName, canPublish } = await createCallToken(live.config, projectId as string, {
      id: user.id,
      name: user.name,
      role: access.role,
    });
    return { ok: true, token, serverUrl: live.config.url, roomName, canPublish };
  } catch (error) {
    if (error instanceof SetupRequiredError) {
      return { ok: false, reason: "error", error: "The server isn't configured." };
    }
    console.error("[calls] token error", error instanceof Error ? error.name : "");
    return { ok: false, reason: "error", error: "Couldn't start the call. Please try again." };
  }
}
