/**
 * MOCK DATA — Phase 1 only.
 * Real users, presence and roles arrive with authentication (Phase 2)
 * and Yjs awareness (Phase 4).
 */
export type PeerColor = "accent" | "violet" | "sky" | "amber" | "rose";

export interface Person {
  id: string;
  name: string;
  handle: string;
  color: PeerColor;
  role: "Owner" | "Editor" | "Viewer";
}

export const currentUser: Person & { email: string } = {
  id: "u_me",
  name: "Darain Qamar",
  handle: "darain",
  email: "darain@example.com",
  color: "accent",
  role: "Owner",
};

export const people: Record<string, Person> = {
  priya: { id: "priya", name: "Priya Sharma", handle: "priya", color: "violet", role: "Editor" },
  leo: { id: "leo", name: "Leo Martins", handle: "leom", color: "sky", role: "Editor" },
  mei: { id: "mei", name: "Mei Chen", handle: "meichen", color: "amber", role: "Editor" },
  sam: { id: "sam", name: "Sam Okafor", handle: "samo", color: "rose", role: "Viewer" },
};

/** Text colour per presence colour, for cursor labels and accents. */
export const peerText: Record<PeerColor, string> = {
  accent: "text-accent",
  violet: "text-peer-violet",
  sky: "text-peer-sky",
  amber: "text-peer-amber",
  rose: "text-peer-rose",
};

export const peerBg: Record<PeerColor, string> = {
  accent: "bg-accent",
  violet: "bg-peer-violet",
  sky: "bg-peer-sky",
  amber: "bg-peer-amber",
  rose: "bg-peer-rose",
};
