/**
 * MOCK DATA — Phase 1 only. Projects will be loaded from PostgreSQL via
 * Prisma in a later phase. Timestamps are pre-formatted strings so the
 * UI renders identically on server and client.
 */
import type { Person } from "./people";
import { people } from "./people";

import type { Language } from "../projects";

export { languageMeta, type Language } from "../projects";

export interface Project {
  id: string;
  name: string;
  description: string;
  language: Language;
  framework: string;
  lastEdited: string;
  lastEditedBy: string;
  collaborators: Person[];
  liveCount: number;
  ownership: "owned" | "shared";
  starred: boolean;
  /** Only the demo project has a working workspace in Phase 1. */
  hasWorkspace: boolean;
  /** Projects created in this browser session; never persisted. */
  local?: boolean;
}

export const projects: Project[] = [
  {
    id: "demo",
    name: "orbit-dashboard",
    description: "Realtime metrics dashboard with live presence and team cursors.",
    language: "TypeScript",
    framework: "Next.js",
    lastEdited: "4 min ago",
    lastEditedBy: "Priya Sharma",
    collaborators: [people.priya, people.leo, people.mei, people.sam],
    liveCount: 3,
    ownership: "owned",
    starred: false,
    hasWorkspace: true,
  },
  {
    id: "ledger-api",
    name: "ledger-api",
    description: "Double-entry accounting service with idempotent transfers.",
    language: "Go",
    framework: "chi · pgx",
    lastEdited: "2 hours ago",
    lastEditedBy: "You",
    collaborators: [people.leo, people.sam],
    liveCount: 0,
    ownership: "owned",
    starred: false,
    hasWorkspace: false,
  },
  {
    id: "vision-lab",
    name: "vision-lab",
    description: "Notebook-style experiments for image segmentation models.",
    language: "Python",
    framework: "PyTorch",
    lastEdited: "Yesterday",
    lastEditedBy: "Mei Chen",
    collaborators: [people.mei, people.priya],
    liveCount: 1,
    ownership: "shared",
    starred: false,
    hasWorkspace: false,
  },
  {
    id: "edge-cache",
    name: "edge-cache",
    description: "Tiny LRU cache with TTL eviction, compiled to WebAssembly.",
    language: "Rust",
    framework: "wasm-bindgen",
    lastEdited: "3 days ago",
    lastEditedBy: "You",
    collaborators: [people.sam],
    liveCount: 0,
    ownership: "owned",
    starred: false,
    hasWorkspace: false,
  },
  {
    id: "hackathon-bot",
    name: "hackathon-bot",
    description: "Discord bot that schedules judging rounds and tracks submissions.",
    language: "JavaScript",
    framework: "Node.js",
    lastEdited: "Oct 12",
    lastEditedBy: "Leo Martins",
    collaborators: [people.leo, people.priya, people.mei],
    liveCount: 0,
    ownership: "shared",
    starred: false,
    hasWorkspace: false,
  },
  {
    id: "type-forms",
    name: "type-forms",
    description: "Schema-first form builder with end-to-end type inference.",
    language: "TypeScript",
    framework: "React",
    lastEdited: "Oct 8",
    lastEditedBy: "You",
    collaborators: [people.priya],
    liveCount: 0,
    ownership: "owned",
    starred: false,
    hasWorkspace: false,
  },
];

export interface Activity {
  id: string;
  who: Person | "you";
  action: string;
  target: string;
  when: string;
}

export const activity: Activity[] = [
  { id: "a1", who: people.priya, action: "edited", target: "MetricCard.tsx", when: "4m" },
  { id: "a2", who: people.leo, action: "joined a call in", target: "orbit-dashboard", when: "12m" },
  { id: "a3", who: "you", action: "pushed 3 commits to", target: "ledger-api", when: "2h" },
  { id: "a4", who: people.mei, action: "shared", target: "vision-lab", when: "1d" },
  { id: "a5", who: people.sam, action: "commented on", target: "edge-cache", when: "3d" },
];
