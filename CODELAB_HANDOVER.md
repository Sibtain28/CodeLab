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
│   ├── app/                      # App router routes ((auth), dashboard, workspace/[id], docs, api/run)
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
├── runner/                       # Standalone Docker execution service (port 4000)
│   ├── index.ts                  # Service entrypoint
│   ├── server.ts                 # Pure Node.js HTTP + SSE streaming server
│   ├── docker.ts                 # Docker container spawn, lifecycle, sandboxing, and process termination
│   └── types.ts                  # RunRequest, ExecutionEvent, HealthResponse types
├── prisma/
│   ├── schema.prisma             # Data models (Better Auth + CodeLab)
│   └── migrations/               # Version-controlled SQL migrations
├── scripts/                      # Helper scripts (dev-all.mjs, add-member.ts)
└── tests/                        # Automated test suites (collab, calls, members, execution)
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

### Phase 6.2: Isolated Code Execution Engine (Docker Prototype)
- **Standalone Execution Service (`runner/` on port 4000):**
  - Decoupled from Next.js web application for independent horizontal scalability and failure containment.
  - Pure Node.js HTTP server (`runner/server.ts`) supporting `GET /health`, `POST /run` (SSE streaming), and `POST /stop` (cancellation).
  - Spawn-based container supervisor (`runner/docker.ts`) directly invoking the Docker CLI without bulky third-party SDK dependencies.

### Phase 6.2.1: Execution Engine Security Hardening
- **Runner Service Protection (Priority 1):**
  - Bound runner strictly to `127.0.0.1` (`RUNNER_HOST`).
  - Removed wildcard CORS headers (`Access-Control-Allow-Origin: *`).
  - Implemented shared-secret authentication (`X-Runner-Secret` / `RUNNER_SECRET`). All `/run` and `/stop` requests require valid authentication; unauthenticated requests are rejected with 401. Secret is never exposed to client browsers.
- **Abuse & Denial-of-Service Protection (Priority 2):**
  - Added sliding-window rate limiting on unauthenticated demo executions (6 executions / min per client IP) using `src/server/rate-limit.ts`.
  - Added global concurrency ceiling (`MAX_CONCURRENT_EXECUTIONS = 5`). Excess execution requests return HTTP 429.
  - Concurrency slots are guaranteed to be released on every exit path (timeout, cancellation, error, completion) via `finally` blocks.
- **Execution Identity & Stop Authorization (Priority 3):**
  - Server-generated cryptographically secure execution IDs (`crypto.randomUUID()`). Client-supplied execution IDs are ignored.
  - Executions are bound to `projectId` and `userId`.
  - `/api/run/stop` strictly validates that the requesting project owns the execution. Cross-project stop attempts are rejected with 403 Forbidden.
- **Docker Container Hardening (Priority 4):**
  - Non-root execution: Container processes run as unprivileged user `1000:1000` (`--user 1000:1000`).
  - Capabilities dropped: All default Linux capabilities dropped (`--cap-drop ALL`).
  - Privilege escalation blocked: Setuid privilege escalations prohibited (`--security-opt no-new-privileges:true`).
  - Maintained baseline sandbox: `--network none`, `--memory 256m`, `--memory-swap 256m`, `--cpus 1.0`, `--pids-limit 64`, `--read-only`, tmpfs `/tmp`.
- **Workspace Protection & Disk Limits (Priority 5):**
  - Hardened `safeJoin` with path separator enforcement, null-byte rejection, and absolute path rejection.
  - Symlink-based escape protection when populating files.
  - Entrypoint validation: Must exist in `files`, cannot start with option flags (`-`), cannot contain traversal.
  - Prevented runtime flag injection: Commands invoked via `./${entrypoint}` and `--` separators.
  - Enforced file size write limit: `--ulimit fsize=20971520:20971520` (max 20MB per written file), preventing disk-fill attacks.
  - Enforced total submitted workspace size limit (max 100 files, max 5MB total).
- **Lifecycle & Cleanup (Priority 6):**
  - Pre-cancelled execution tracking: Stop requests received during workspace preparation abort immediately before Docker spawn.
  - Client disconnection propagation: Dropped HTTP client connections automatically stop running containers.
  - Cleanup on shutdown: `cleanupAllExecutions()` terminates active containers on `SIGINT`/`SIGTERM`.
  - Stale directory sweeping: Stale temp directories in `/tmp/codelab-runner` are cleaned on startup.
- **Automated Tests (`tests/execution.test.ts`):** 26 tests covering Docker availability, Python/JS execution, error handling, network isolation, read-only rootfs, non-root execution (UID 1000), file size limits, safeJoin traversal, entrypoint validation, concurrency ceilings, early startup cancellation, timeout enforcement, active cancellation, HTTP runner authentication/ownership checks, real-time Python `input()` and Node.js `readline` interaction over WebSocket, Ctrl+C (SIGINT) signal handling, terminal token authentication and cross-project isolation, and automatic container cleanup on WebSocket disconnect.

### Phase 6.3 — Interactive Terminal Implementation (Completed)
- **Terminal UI (`src/components/workspace/xterm-view.tsx` & `bottom-panel.tsx`):**
  - Integrated `@xterm/xterm` with `@xterm/addon-fit` for responsive resizing.
  - CodeLab light theme styling (`#ffffff` background, `#20211f` text, `#26734d` forest green cursor, monospace font).
  - Handles real-time keystroke input, line buffering, local echo, Enter (`\r\n`), Backspace with character erasure (`\b \b`), and Ctrl+C (`\x03` -> SIGINT).
  - Idle interactive prompt (`codelab $ `) with built-in commands (`run`, `clear`, `help`).
  - Terminal instance lifecycle stabilized to avoid unmounting on tab change or execution state transitions.
  - Connected clear terminal button to `xterm.clear()`.
- **WebSocket Protocol & Security (`runner/server.ts`, `runner/token.ts`, `src/server/terminal-token.ts`):**
  - Added WebSocket server endpoint at path `/terminal` on the runner server.
  - Signed terminal tokens using HMAC-SHA256 derived via HKDF from `RUNNER_SECRET || BETTER_AUTH_SECRET`.
  - Token claims bind user ID, project ID, execution ID, and 60-second expiration.
  - WebSocket connection strictly validates token signature, expiration, and cross-project authorization (rejecting bad tokens with 4401 and cross-project mismatches with 4403).
- **Interactive Container I/O (`runner/docker.ts`):**
  - Spawns Docker with standard input open (`-i`) without pseudo-TTY flag, enabling clean stdin piping for Python `input()` and Node.js `readline`.
  - Added `writeExecutionStdin(executionId, data)` with carriage-return normalization (`\r\n` -> `\n`).
  - Added `sendExecutionSignal(executionId, signal)` for SIGINT (Ctrl+C) handling, cleanly exiting with KeyboardInterrupt / exit code 130.
  - Added early output buffering (`earlyBuffer`) so stdout/stderr produced during container startup is preserved and flushed to the WebSocket upon connection.
  - Disconnect cleanup: Closing or aborting the WebSocket connection automatically stops the container and frees concurrency slots.
- **Next.js Integration (`src/app/api/run/route.ts` & `src/components/workspace/workspace-ide.tsx`):**
  - Supported `interactive: true` in `/api/run`.
  - Issues signed terminal token to authenticated project members (or demo users).
  - Updated `WorkspaceIDE` to manage WebSocket lifecycle, stream stdout/stderr into `xterm.write`, and forward stdin/signals.

### Phase 6.4 — Collaborative Execution & Output Sharing (Completed)
- **Architectural Division of Concerns:**
  - **Presence Awareness:** Yjs awareness in the project presence room (`project:<projectId>`) broadcasts ephemeral execution metadata (`{ executionId, entrypoint, language, startedBy, startedAt }`). Yjs document state (`project_file.ydoc`) is NOT polluted with streaming stdout/stderr text chunks, avoiding database document bloat.
  - **Multi-Client WebSocket Fan-Out:** The runner service (`runner/docker.ts` & `runner/server.ts`) maintains a `sockets: Set<WebSocket>` for each active execution session. All stdout, stderr, and exit events are fanned out concurrently in real time to every connected member.
  - **Rolling History Buffer Replay:** The runner maintains a 2000-chunk rolling output history buffer. When an observer joins an in-progress session, the complete prior output history is replayed immediately so late joiners see the entire execution context.
  - **Strict Observer Mode (Requirement 8):** The runner tracks `ownerSocket` (bound to `active.userId`). Any observer attempting to send `stdin` is rejected server-side with `{ type: "error", error: "Terminal input is disabled in observer mode." }`, preventing unauthorized typing into running containers while allowing read-only observation.
  - **Role-Based Stop Authorization (Requirement 4):** `/api/run/stop` and runner `stopExecution` enforce that only the session initiator (`request.userId === active.userId`) OR an authorized project owner (`isProjectOwner: true`) can stop the execution. Other members receive HTTP 403 Forbidden.
  - **Cross-Project Isolation & Authorization (Requirements 5 & 6):**
    - `GET /api/run/active?projectId=...`: Validates project membership via DAL and returns active session details and token for that project only.
    - `POST /api/run/token`: Issues scoped terminal tokens verifying user role and project access.
    - Runner validates HMAC signature, expiration, and project binding (`claims.pid === active.projectId`), rejecting foreign tokens with 4403.
  - **Session Lifecycle & Disconnect Grace Period (Requirement 7):**
    - If all clients (initiator + all observers) disconnect from the runner, a 2-second grace period timer starts. If no clients reconnect before the grace period expires, the container is automatically terminated to prevent orphaned processes.
    - If an observer reconnects within the grace period, the timer is cancelled and streaming resumes seamlessly.
  - **UI Integration (`WorkspaceIDE`, `BottomPanel`, `Toolbar`):**
    - When a peer starts execution, `useCollaboration` detects `remoteExecution` via awareness and automatically opens the bottom panel in Terminal tab.
    - Terminal displays an "Observing" badge with the initiator's name and read-only status.
    - Non-initiator project members who are not owners see a disabled Stop button with clear explanatory tooltip guidance.
    - Full terminal FitAddon resizing and CodeLab light editorial theme preserved across tabs.

### Phase 7.1 — TypeScript Runtime Support (Completed)
- **Dedicated Runtime Strategy:**
  - Standardized on `node:22-alpine` for TypeScript execution, leveraging Node 22's native type stripping engine with `--no-warnings --experimental-transform-types`.
  - Zero dynamic package downloads at runtime (100% offline), preserving strict network isolation (`--network none`).
  - Supports TypeScript type annotations, interfaces, type aliases, generics, enums, and namespaces without external bundlers.
- **Multi-File TypeScript Support:**
  - Supports standard ESM relative TypeScript imports (`import { ... } from "./file.ts"`).
  - Preserves normal Node.js standard library APIs (`node:readline`, `node:fs`, `node:path`, `node:crypto`, `node:os`).
- **Clear Error Reporting:**
  - Syntax/compilation errors are reported clearly in the terminal with code snippets and pointer indicators (`SyntaxError [ERR_INVALID_TYPESCRIPT_SYNTAX]`).
  - Runtime exceptions provide full stack traces with exit code 1.
- **Interactive Stdin & Collaborative Support:**
  - Fully compatible with Phase 6.3 interactive terminal (`node:readline` / stdin) and Phase 6.4 multi-client collaborative observation.
- **Automatic Language & Entrypoint Detection:**
  - Updated `detectRunnable()` in `WorkspaceIDE` to prioritize active `.ts` files (excluding `.d.ts`), with fallbacks to standard project entrypoints (`main.ts`, `index.ts`, `src/index.ts`, `src/main.ts`, `app.ts`).
  - Strict separation: TypeScript files run exclusively through the TypeScript container runner (`node:22-alpine` with `--experimental-transform-types`) and never route through the JavaScript-only Node 20 runner.
- **Preserved Isolation & Security:**
  - All existing Docker hardening guarantees are preserved: `--network none`, `--read-only`, non-root user `1000:1000`, `--cap-drop ALL`, tmpfs `/tmp`, and 20MB file write limit.

### Phase 7.2 — C++ Runtime Support (Completed)
- **Isolated Compiler & Runtime Strategy:**
  - Standardized on `frolvlad/alpine-gxx:latest` (~80MB lightweight Alpine image with GCC 14.2.0), providing modern C++20 support (`-std=c++20 -O2`).
  - 100% offline execution without network access (`--network none`); no external dependencies downloaded during user execution.
- **Two-Stage Safe Compilation & Execution:**
  - Safe shell orchestration inside container: `g++ -O2 -std=c++20 <entrypoint> <helperFiles...> -o ./app && exec ./app`.
  - Output binary `./app` is written to `/workspace:rw` (mounted with mode 0777).
  - `exec ./app` replaces the shell process so standard POSIX signals (SIGINT / Ctrl+C) and exit codes propagate directly to the running application without shell interference.
- **Multi-File C++ Support:**
  - Helper translation units (`.cpp`, `.cc`, `.cxx`) in the workspace are automatically detected and compiled alongside the entrypoint if they do not define a colliding `main()`.
  - Header files (`.h`, `.hpp`) in `/workspace` are resolved by `g++` via default include paths.
- **Clear Compilation & Runtime Error Output:**
  - Compilation errors (missing semicolons, syntax errors, type errors) are printed to `stderr` with line numbers, code snippets, and caret indicators, exiting with a non-zero exit code.
  - Runtime exceptions (`std::runtime_error`, uncaught exceptions, segfaults) cleanly stream the exception message to `stderr` and terminal output with appropriate exit codes.
- **Interactive std::cin & Collaborative Execution:**
  - Real-time `std::cin` input streaming supported over interactive WebSockets for single and multi-prompt workflows.
  - Ctrl+C (SIGINT) handled via `sendExecutionSignal(executionId, "SIGINT")`, cleanly terminating interactive loops.
  - Phase 6.4 collaborative live execution and observer streaming works seamlessly with C++ sessions.
- **Automatic Language & Entrypoint Detection:**
  - Prioritizes active `.cpp`, `.cc`, or `.cxx` tabs, falling back to standard entrypoints (`main.cpp`, `app.cpp`, `src/main.cpp`, or any `.cpp` in the workspace).
  - Updated Monaco editor and tokenizer (`src/lib/highlight.ts`) with C++ language mapping (`"cpp"`).

### Phase 7.3 — Go Runtime Support (Completed)
- **Isolated Compiler & Runtime Strategy:**
  - Standardized on `golang:1.24-alpine` (official, stable pinned Alpine image providing Go 1.24).
  - 100% offline execution without network access (`--network none`); no external dependencies downloaded during user execution.
- **Cache & Temp Filesystem Configuration:**
  - Configured Go build caches (`GOCACHE=/workspace/.gocache`, `GOPATH=/workspace/.gopath`) within the writable `/workspace:rw` mount.
  - Sized temporary filesystem mount to `--tmpfs /tmp:rw,noexec,nosuid,size=64m` with `GOTMPDIR=/tmp`, ensuring linker and toolchain temporary files map cleanly under strict memory and read-only container root constraints.
- **Two-Stage Safe Compilation & Execution:**
  - Compilation and execution via shell orchestration:
    ```bash
    GOCACHE=/workspace/.gocache GOPATH=/workspace/.gopath GOTMPDIR=/tmp go build -o ./app <sources...> && exec ./app
    ```
  - The compiled binary `./app` is written to `/workspace` and executed with `exec ./app`, replacing the shell process to propagate POSIX signals (SIGINT / Ctrl+C) and exit codes directly.
- **Multi-File Go Support:**
  - Automatically identifies all helper `.go` files in the workspace (excluding `_test.go` and files defining their own `func main()`) and passes them to `go build` alongside the selected entrypoint.
- **Clear Compilation & Runtime Error Output:**
  - Compiler errors (e.g. syntax errors, type errors, undefined variables) output standard `go build` diagnostic messages to `stderr` with line numbers and exit code 1.
  - Runtime panics output panic traces and stack traces to `stderr` with exit code 2.
- **Interactive Stdin & Collaborative Execution:**
  - Full support for interactive input (`fmt.Scan`, `fmt.Scanln`, `bufio.Scanner`) over WebSockets.
  - Real-time Ctrl+C (SIGINT) handling via WebSocket signal forwarding.
  - Seamless Phase 6.4 collaborative live execution and observer history replay for Go sessions.
- **Automatic Language & Entrypoint Detection:**
  - Prioritizes active `.go` tabs, falling back to standard entrypoints (`main.go`, `app.go`, or any `.go` file in the workspace).
  - Configured Monaco editor and syntax tokenizer (`src/lib/highlight.ts`) with Go language mapping (`"go"`).

---

## Automated Verification Status (All Passing)
- **Execution Suite:** `npm run test:execution` — **52/52 tests passing** (Docker isolation, Python/JS/TS/C++/Go execution, Go standard library, multi-file Go, Go compilation errors, Go runtime panics, interactive Go `fmt.Scan` over WebSocket, multiple `fmt.Scan` inputs, Go Ctrl+C SIGINT handling, Go collaborative live execution, C++20 features, multi-file C++, C++ errors/signals/collab, type annotations, interfaces, enums, multi-file TS, TS errors, interactive TS readline, security hardening, non-root UID 1000, concurrency, timeouts, HTTP runner auth, interactive terminal WebSocket, multi-client broadcast, history replay, observer stdin blocking, stop authorization, and disconnect cleanup).
- **Members Suite:** `npm run test:members` — **14/14 tests passing** (6 suites).
- **Collaboration Suite:** `npm run test:collab` — **18/18 tests passing** (4 suites).
- **Calls Suite:** `npm run test:calls` — **16/16 tests passing** (4 suites).
- **TypeScript:** `npm run typecheck` — **0 errors** (`next typegen && tsc --noEmit`).
- **Linter:** `npm run lint` — **0 errors** (`eslint`).
- **Production Build:** `npm run build` (`npx next build --webpack`) — **Successful** build generating all static and dynamic routes.

---

## Known Limitations & Remaining Issues
1. **Local Docker Requirement:**
   - The execution engine requires Docker to be running on the host machine. If Docker daemon is unavailable, the runner reports `{ docker: false }` with helpful diagnostics.
2. **In-Memory Rate Limiting:**
   - `src/server/rate-limit.ts` uses an in-process Map; should be backed by Redis or Postgres for multi-instance deployments.
3. **Collaborative Stdin Input (Future Phase):**
   - Only the execution owner can provide terminal stdin (strict observer mode). Collaborative typing or shared control can be added with explicit turn-taking or permissions in a subsequent phase.
4. **External Third-Party Libraries (Future Phase):**
   - Runtimes currently execute with Node.js/Python/C++/Go standard libraries only under `--network none`. Pre-installed modules or vendored dependency support can be introduced in a future phase.
5. **Auth Enhancements:**
   - No password reset or email verification loops currently implemented.

---

## Recommended Next Tasks

1. **Phase 7.4 — Rust Runtime Support:**
   - Add native compilation and execution support for Rust (`rustc` / `cargo`) with isolated Docker sandboxing.
2. **Phase 7.5 — Collaborative Terminal Input & Hand-Off:**
   - Allow execution session owners to hand off terminal input control to collaborators or enable shared terminal input with visual cursor indicators.
