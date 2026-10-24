/**
 * Server-only LiveKit token minting (imported by the server action and tests;
 * never by client components). The API secret is only used here.
 */
import { AccessToken, TrackSource } from "livekit-server-sdk";
import { CALL_PERMISSIONS, CALL_TOKEN_TTL_SECONDS, callRoomName, type CallRole } from "./policy";

export interface LiveKitConfig {
  url: string;
  apiKey: string;
  apiSecret: string;
}

/**
 * Reads LiveKit settings from the environment. Returns the names of missing
 * or invalid variables (never their values).
 */
export function readLiveKitConfig(env: Record<string, string | undefined> = process.env):
  | { ok: true; config: LiveKitConfig }
  | { ok: false; problems: string[] } {
  const url = env.LIVEKIT_URL?.trim() ?? "";
  const apiKey = env.LIVEKIT_API_KEY?.trim() ?? "";
  const apiSecret = env.LIVEKIT_API_SECRET?.trim() ?? "";
  const problems: string[] = [];
  if (!url) problems.push("LIVEKIT_URL is not set");
  else if (!/^wss?:\/\/[^\s/]+/.test(url)) problems.push("LIVEKIT_URL must start with wss:// (or ws:// for a local server)");
  if (!apiKey) problems.push("LIVEKIT_API_KEY is not set");
  if (!apiSecret) problems.push("LIVEKIT_API_SECRET is not set");
  return problems.length ? { ok: false, problems } : { ok: true, config: { url, apiKey, apiSecret } };
}

export interface CallParticipant {
  /** Verified user id from the session — never from the client. */
  id: string;
  name: string;
  role: CallRole;
}

/** Mints a short-lived token for one user in one workspace's room. */
export async function createCallToken(config: LiveKitConfig, projectId: string, user: CallParticipant) {
  const roomName = callRoomName(projectId);
  const { canPublish } = CALL_PERMISSIONS[user.role];
  const token = new AccessToken(config.apiKey, config.apiSecret, {
    identity: user.id,
    name: user.name,
    ttl: CALL_TOKEN_TTL_SECONDS,
    // Set by the server so other participants can trust it.
    metadata: JSON.stringify({ role: user.role.toLowerCase() }),
  });
  token.addGrant({
    roomJoin: true,
    room: roomName,
    canSubscribe: true,
    canPublish,
    canPublishSources: canPublish ? [TrackSource.MICROPHONE, TrackSource.CAMERA] : [],
    canPublishData: false,
    // Names and metadata come from the server, not the browser.
    canUpdateOwnMetadata: false,
  });
  return { token: await token.toJwt(), roomName, canPublish };
}
