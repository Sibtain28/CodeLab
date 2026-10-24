/**
 * Call rules shared by the server (token minting) and the browser (UI).
 * Pure module: no secrets, no Node-only APIs.
 */
const PROJECT_ID = /^c[a-z0-9]{20,32}$/;

/** One stable LiveKit room per workspace, derived only from a validated project id. */
export function callRoomName(projectId: string) {
  if (!PROJECT_ID.test(projectId)) throw new Error("invalid project id");
  return `codelab-project-${projectId}`;
}

export type CallRole = "OWNER" | "EDITOR" | "VIEWER";

/**
 * What each workspace role may do in the call.
 * Viewers are read-only in the editor, so in calls they can listen and watch
 * but not publish their microphone or camera. Change `VIEWER.canPublish` here
 * to let viewers speak; the server and UI both follow this table.
 */
export const CALL_PERMISSIONS: Record<CallRole, { canPublish: boolean }> = {
  OWNER: { canPublish: true },
  EDITOR: { canPublish: true },
  VIEWER: { canPublish: false },
};

/** Tokens only need to be valid long enough to join; LiveKit refreshes them in-call. */
export const CALL_TOKEN_TTL_SECONDS = 10 * 60;
