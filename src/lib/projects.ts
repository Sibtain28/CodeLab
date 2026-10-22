/**
 * Project types and validation rules shared by the client UI and the server.
 * Nothing here is secret; the server re-validates everything it receives.
 */
export const LANGUAGES = ["TypeScript", "JavaScript", "Python", "Go", "Rust"] as const;
export type Language = (typeof LANGUAGES)[number];

export const languageMeta: Record<Language, { color: string; short: string }> = {
  TypeScript: { color: "#2f6fb5", short: "TS" },
  JavaScript: { color: "#a88300", short: "JS" },
  Python: { color: "#356f9f", short: "PY" },
  Go: { color: "#00788f", short: "GO" },
  Rust: { color: "#b0480f", short: "RS" },
};

export const defaultFramework: Record<Language, string> = {
  TypeScript: "Next.js",
  JavaScript: "Node.js",
  Python: "FastAPI",
  Go: "net/http",
  Rust: "Axum",
};

export const VISIBILITIES = ["private", "team", "public"] as const;
export type Visibility = (typeof VISIBILITIES)[number];

/** Project names are URL-safe slugs: 3–40 chars, lowercase, dashes inside. */
export const PROJECT_NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
export const PROJECT_DESCRIPTION_MAX = 280;

/**
 * File paths: relative, `/`-separated, no empty or dot segments.
 * Letters, digits, `.`, `_`, `-` per segment.
 */
export const FILE_PATH_MAX = 200;
const SEGMENT = /^(?!\.{1,2}$)[A-Za-z0-9._-]{1,64}$/;
export function isValidFilePath(path: string) {
  if (!path || path.length > FILE_PATH_MAX) return false;
  return path.split("/").every((s) => SEGMENT.test(s));
}

/** Maximum size of one file's content, in characters. */
export const FILE_CONTENT_MAX = 500_000;
export const MAX_FILES_PER_PROJECT = 500;

export function slugifyProjectName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, "-");
}

// ─── Shapes sent from the server to client components ──────────────────────
// Only display data: no emails of other users, no tokens, no internal ids
// beyond the project's own id.

import type { PeerColor } from "./mock/people";

export type MemberRoleLabel = "Owner" | "Editor" | "Viewer";

export interface MemberSummary {
  id: string;
  name: string;
  color: PeerColor;
  role: MemberRoleLabel;
}

export interface ProjectSummary {
  id: string;
  name: string;
  description: string;
  language: Language;
  framework: string;
  visibility: Visibility;
  /** The signed-in user's role in this project. */
  role: MemberRoleLabel;
  starred: boolean;
  /** ISO timestamp of the last change, for sorting. */
  updatedAt: string;
  /** Pre-formatted on the server so server and client render the same text. */
  updatedLabel: string;
  lastEditedBy: string | null;
  /** Other members (not the signed-in user). */
  others: MemberSummary[];
}

const COLORS: PeerColor[] = ["violet", "sky", "amber", "rose", "accent"];

/** Stable presence colour for a user id. */
export function colorFor(id: string): PeerColor {
  let h = 0;
  for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) | 0;
  return COLORS[Math.abs(h) % COLORS.length];
}
