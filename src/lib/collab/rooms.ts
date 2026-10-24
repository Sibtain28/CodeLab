/**
 * Collaboration room names, shared by the browser, the Next.js server and the
 * collab server. The collab server only accepts names that parse here, and
 * then checks the ids against the signed token and the database.
 */
const ID = "c[a-z0-9]{20,32}";
const PROJECT_ROOM = new RegExp(`^project:(${ID})$`);
const FILE_ROOM = new RegExp(`^file:(${ID}):(${ID})$`);

/** Presence-only room: who is in the project and which file they're viewing. */
export const projectRoom = (projectId: string) => `project:${projectId}`;
/** One shared Yjs document per project file. */
export const fileRoom = (projectId: string, fileId: string) => `file:${projectId}:${fileId}`;

export type ParsedRoom =
  | { kind: "project"; projectId: string }
  | { kind: "file"; projectId: string; fileId: string };

export function parseRoom(name: unknown): ParsedRoom | null {
  if (typeof name !== "string" || name.length > 100) return null;
  const project = PROJECT_ROOM.exec(name);
  if (project) return { kind: "project", projectId: project[1] };
  const file = FILE_ROOM.exec(name);
  if (file) return { kind: "file", projectId: file[1], fileId: file[2] };
  return null;
}

/** Y.Text holding the file's text. */
export const TEXT_KEY = "content";
/** Y.Map with the last explicit save: { version: number, hash: string }. */
export const SAVED_KEY = "saved";
