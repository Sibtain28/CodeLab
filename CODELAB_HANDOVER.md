# CodeLab — Project Handover & Architecture Document

## Overview
CodeLab is a collaborative browser-based IDE enabling real-time code editing, presence, syntax highlighting, workspace management, and integrated audio/video calling.

---

## Technology Stack
- **Framework:** Next.js 16.4.6 (App Router, Turbopack, React 19)
- **Language:** TypeScript (strict mode)
- **Database & ORM:** PostgreSQL (Neon) via Prisma ORM (`@prisma/client`, `@prisma/adapter-pg`)
- **Authentication:** Better Auth (email + password, scrypt hashing, HTTP-only signed cookies)
- **Code Editor:** Monaco Editor (`monaco-editor`) with custom lifecycle and Yjs bindings
- **Real-Time Collaboration:** Standalone Node.js Hocuspocus server (`@hocuspocus/server`, `@hocuspocus/provider`) + Yjs CRDTs (`yjs`, `y-protocols`)
- **Calling / Media:** LiveKit (`livekit-client`, `livekit-server-sdk`, `@livekit/components-react`)
- **Styling:** Tailwind CSS v4 (`@tailwindcss/turbopack`)
- **Icons:** Lucide React (`lucide-react`)

---

## Directory Structure
```
codelab/
├── src/
│   ├── app/                      # App router routes ((auth), dashboard, workspace/[id], docs)
│   ├── calls/                    # LiveKit token generation and room access policies
│   ├── collab/                   # Server-side HMAC token signing for collab server
│   ├── components/
│   │   ├── auth/                 # Auth pages & setup screen
│   │   ├── dashboard/            # Project cards, dialogs, sidebar
│   │   ├── workspace/            # Workspace IDE, Monaco editor, tabs, bottom panel
│   │   │   └── call/             # LiveKit audio/video calling tray
│   │   └── ui/                   # Shared UI primitives (buttons, modals, toasts)
│   ├── lib/
│   │   ├── collab/               # Monaco Yjs binding, awareness, cursor sync, hashing
│   │   └── monaco/               # Monaco setup, themes, worker configs
│   └── server/
│       ├── actions/              # Server Actions (auth, files, projects, invites, calls, members)
│       ├── auth.ts               # Better Auth instance
│       ├── dal.ts                # Data Access Layer (session & project authorization)
│       ├── db.ts                 # Prisma singleton
│       ├── file-save.ts          # Optimistic concurrency file save logic
│       ├── members.ts            # Project member database transactions & invariants
│       └── rate-limit.ts         # In-memory sliding window rate limiter
├── collab/                       # Standalone Hocuspocus WebSocket server (port 1234)
│   ├── index.ts                  # Server entry point
│   └── server.ts                 # Real-time Yjs document sync, Postgres persistence, reconciliation
├── prisma/
│   ├── schema.prisma             # Data models (Better Auth + CodeLab)
│   └── migrations/               # Version-controlled SQL migrations
├── scripts/                      # Helper scripts (dev-all.mjs, add-member.ts)
└── tests/                        # Automated test suites (collab.test.ts, calls.test.mts, members.test.ts)
```

---

## Implemented Phases

### Phase 1 & 2: Workspace Layout & Monaco Code Editor
- Integrated Monaco Editor wrapped in custom React layout effect lifecycle (handles Next.js Cache Components / React `<Activity>` without unmounting bugs).
- Per-file Monaco model switching (`file:///${path}`) preserving undo stack, cursor, and scroll position.
- Keyboard shortcuts: `⌘S` (save), `⌘↵` (run), `⌘B` (explorer), `⌘J` (bottom panel), `⌘⇧K` (collab).

### Phase 3: Authentication & Project Access Control
- Better Auth email/password authentication.
- Scrypt password hashing, session cookies, route protection via `src/proxy.ts` and `src/server/dal.ts`.
- Project access control based on `project_member` table (`OWNER`, `EDITOR`, `VIEWER`).
- Non-members receive generic `not_found` errors to prevent project ID enumeration.

### Phase 4: Live Real-Time Collaboration & Invites
- Standalone Hocuspocus WebSocket server on port 1234 (`npm run collab` or `npm run dev:all`).
- Short-lived HMAC token authentication derived from `BETTER_AUTH_SECRET`.
- Yjs CRDT synchronization with `MonacoYBinding` and custom awareness cursor rendering.
- File-level rooms (`file:<projectId>:<fileId>`) and project presence rooms (`project:<projectId>`).
- Database persistence of `Y.Doc` state in `project_file.ydoc` (debounced 2s - 10s).
- Workspace shareable invite links with SHA-256 hashed tokens and role assignment.

### Phase 4.5: Offline Save Reconciliation & Conflict Detection (Committed in 38d649f)
- Polling mechanism in `collab/server.ts` (`reconcileWithSaved`) reconciling open live documents against external database saves.
- Unsaved live drafts are preserved; conflicts are flagged via `latest` in `saved` map rather than discarding edits.
- Added grace period to prevent false conflict alerts while client save markers are in flight.
- Modularized database transaction logic into `src/server/file-save.ts` with optimistic concurrency.
- Workspace IDE UI prompt allowing users to keep their draft or load the saved version.
- Added comprehensive automated test suite in `tests/collab.test.ts` for offline save handling.

### Phase 5: LiveKit Audio & Video Calling
- LiveKit Cloud integration scoped to project rooms (`codelab-project-<projectId>`).
- Role-based permissions (Owners/Editors can publish audio/video; Viewers can listen/watch only).
- In-IDE call tray, speaker detection ring, mute/unmute, camera toggle, device error handling.
- Automated tests in `tests/calls.test.mts` validating token contents, permissions, and error handling.

### Phase 5.5: Member Management & Role Controls
- **Data & Invariants Layer (`src/server/members.ts`):**
  - Database-level protection: `Project.ownerId` and any `OWNER` membership row are completely immutable (cannot be demoted, removed, or transferred).
  - Role mutations strictly scoped to `projectId` and `targetUserId`.
  - Allowed transitions strictly between `EDITOR` and `VIEWER`.
- **Server Actions (`src/server/actions/members.ts`):**
  - `listProjectMembers`: Any project member can view the member roster; owner status flagged.
  - `updateMemberRole`: Enforces `requireOwner`. Validates target user and updates role.
  - `removeProjectMember`: Enforces `requireOwner`. Deletes membership row and immediately kicks participant from active LiveKit call room if LiveKit is configured.
- **UI Integration (`ProjectInviteDialog`):**
  - Real-time member roster under "People with access" with presence avatars, emails, and roles.
  - Owner controls: Inline role selector (`Editor` / `Viewer`) and "Remove" button with inline confirmation.
  - Non-owner view: Clean read-only display.
- **Session Revocation & Collaboration Lifetime:**
  - LiveKit: Removed participant is immediately kicked from the room via LiveKit SDK `RoomServiceClient.removeParticipant`.
  - HTTP / Server Actions: Subsequent file reads/saves or project actions immediately throw `AccessError("not_found")` or `AccessError("forbidden")`.
  - Hocuspocus: Short-lived tokens (10 minutes). On reconnect or opening another file room, database re-check blocks removed members (`not a member`) and enforces `readOnly: true` on demoted viewers. Active WebSocket connections stay read-only or open until reconnect or token expiry.
- **Automated Tests (`tests/members.test.ts`):** 14 tests across 6 suites covering invariants, unauthorized mutations, role transitions, cross-project scoping, and post-removal access denial.

---

## Automated Verification Status (All Passing)
- **Members Suite:** `npm run test:members` — **14/14 tests passing** (6 suites).
- **Collaboration Suite:** `npm run test:collab` — **18/18 tests passing** (4 suites).
- **Calls Suite:** `npm run test:calls` — **16/16 tests passing** (4 suites).
- **TypeScript:** `npm run typecheck` — **0 errors** (`next typegen && tsc --noEmit`).
- **Linter:** `npm run lint` — **0 errors** (`eslint`).
- **Production Build:** `npm run build` — **Successful** Turbopack production build.

---

## Known Limitations & Remaining Issues
1. **Simulated Execution & Terminal:**
   - The "Run" button and bottom "Terminal" tab in `src/components/workspace/bottom-panel.tsx` are mock simulations. No containerized runner or WebContainer execution is hooked up yet.
2. **In-Memory Rate Limiting:**
   - `src/server/rate-limit.ts` uses an in-process Map; should be backed by Redis or Postgres for multi-instance deployments.
3. **Auth Enhancements:**
   - No password reset or email verification loops currently implemented.
4. **Hocuspocus Real-Time Connection Termination:**
   - Hocuspocus runs as a separate Node process with no direct IPC endpoint from Next.js server actions. Removed members are blocked at the database level on explicit saves and on room reconnects/token expiry (10 min), but existing open WebSockets are not terminated via out-of-band IPC.

---

## Recommended Next Tasks

1. **Phase 6 — Real Code Execution Engine:**
   - Integrate WebContainers (in-browser Node.js runtime) or a sandboxed execution API (Docker/microVM runner) into `bottom-panel.tsx` to replace simulated terminal/runner with real command execution.
