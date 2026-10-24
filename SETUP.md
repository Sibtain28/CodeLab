# CodeLab: database and accounts setup

CodeLab stores accounts, projects and files in PostgreSQL through Prisma.
Sign-in uses Better Auth with email and password.

Until the three environment variables below are set, the app still runs:

- `/login`, `/signup` and `/dashboard` show a **Setup required** notice.
- `/workspace/demo` keeps working with sample data.

## 1. Get a PostgreSQL database

### Option A: Neon (managed, free tier, recommended)

1. Sign up at https://neon.tech. A free plan is enough.
2. Create a project. Any name works; pick the region closest to you.
3. On the project dashboard, click **Connect**.
4. Copy the connection string. It looks like
   `postgresql://USER:PASSWORD@ep-xxxx.REGION.aws.neon.tech/neondb?sslmode=require`.
   Keep `?sslmode=require` at the end.

### Option B: Local PostgreSQL

Use a local PostgreSQL 15 or newer (Postgres.app, Homebrew `postgresql@16`, or Docker).
Create a database called `codelab`. The connection string is then
`postgresql://USER:PASSWORD@localhost:5432/codelab`.

## 2. Create `.env`

```bash
cp .env.example .env
```

Open `.env` and fill in the three variables:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | The connection string from step 1 |
| `BETTER_AUTH_SECRET` | A random secret. Generate one with `openssl rand -base64 32` |
| `BETTER_AUTH_URL` | `http://localhost:3000` in development |

`.env` is git-ignored. Never commit it, and never paste its values into chats or issues.

## 3. Install and run the migration

```bash
npm install            # also runs `prisma generate`
npx prisma migrate dev # creates the tables in your database
npm run dev
```

`prisma migrate dev` applies everything in `prisma/migrations`. In development it also
creates a new migration when `prisma/schema.prisma` changes.

For a production database, use `npx prisma migrate deploy` (or `npm run db:deploy`).
It only applies existing migrations.

To browse the data, run `npx prisma studio`.

## Data model

| Table | Purpose |
| --- | --- |
| `user`, `session`, `account`, `verification` | Better Auth. Passwords are scrypt hashes stored in `account.password`. |
| `project` | Owner, slug name (unique per owner), description, language, framework, visibility |
| `project_member` | One row per user with access (OWNER / EDITOR / VIEWER) and the user's own star |
| `project_file` | Path (unique per project), content, and a `version` that increases on every save |
| `project_invite` | Invite links: SHA-256 hash of the token, role, expiry, revocation, use count |

Deleting a user or a project cascades to their memberships and files.

## How access is enforced

- `src/proxy.ts` redirects visitors with no session cookie away from `/dashboard` and
  `/workspace/*`. This is only a fast first check.
- The real checks happen in `src/server/dal.ts` on every page and server action:
  - the session is verified against the database;
  - project access is checked through `project_member`.
- Non-members get "not found" for any project id, so ids can't be probed.
- Saves use the file's `version`. A save that started from an older version is rejected
  instead of overwriting newer content. The editor then offers an explicit choice: keep your
  version or load the saved one.

## 4. Live collaboration (Phase 4)

Live co-editing runs in a second Node process. Next.js route handlers can't hold
WebSocket connections, so the collab server is separate.

```bash
npx prisma migrate dev   # applies pending migrations (adds project_file.ydoc, project_invite)
npm run dev:all          # the app (http://localhost:3000) and the collab server (ws://localhost:1234)
```

Or run them separately: `npm run dev` in one terminal and `npm run collab` in another.
If the collab server isn't running, the workspace says "Live editing off — edits save
normally" and the dev terminal says why.

Add `COLLAB_URL="ws://localhost:1234"` to `.env`. Without it, live editing is off and the
editor works as in Phase 3.

| Variable | Used by | Purpose |
| --- | --- | --- |
| `COLLAB_URL` | Next.js (read per request) | WebSocket URL the browser connects to |
| `COLLAB_PORT` | collab server | Port to listen on (default 1234) |
| `COLLAB_ALLOWED_ORIGINS` | collab server | Comma-separated browser origins (default: `BETTER_AUTH_URL`'s origin) |

The collab server also reads `DATABASE_URL` and `BETTER_AUTH_SECRET` from `.env`. It
doesn't need any new secret.

### How it works

- **Rooms.** There is one Yjs document per file, `file:<projectId>:<fileId>`. There is
  also one presence room per project, `project:<projectId>`, which shows who is online
  and which file they're viewing.
- **Access.**
  1. The browser gets a 10-minute token from the `getCollabToken` server action. The
     action uses the normal session and membership check.
  2. The token is an HMAC signed with a key derived from `BETTER_AUTH_SECRET`.
  3. For every room, the collab server:
     - verifies the token;
     - accepts only room names it can parse;
     - checks that the room's project matches the token;
     - re-checks membership, and that the file belongs to the project, in the database.
  4. Viewers are read-only.
  5. WebSocket upgrades from other origins are refused.
- **Saved file vs. live document.**
  - `project_file.content` and `version` are the saved file. They change only on ⌘S,
    through the existing `saveFile` action and its version check.
  - `project_file.ydoc` holds the live document, including unsaved shared edits. The
    collab server writes it about 2 seconds after changes (at most every 10 seconds),
    and again on shutdown.
  - **First open:** the document is filled from `content` and stored immediately.
  - **Later opens, reconnects and restarts:** the stored state is reused, so text is
    never duplicated.
  - **Newer save made while live editing was off:** if nobody has unsaved shared edits,
    the live text switches to the saved content. Otherwise the shared edits are kept and
    marked unsaved.
- **Saving.**
  - ⌘S saves the shared text and records `{version, hash}` in the document, so every
    collaborator's unsaved dot clears together.
  - Saving is paused while the live connection is down. Edits made offline sync when it
    reconnects.
- **Undo** (⌘Z / ⌘⇧Z) only reverts your own edits.

### Inviting people

1. The project owner opens the workspace, clicks **Invite**, picks **Editor** or
   **Viewer**, and clicks **Create link**.
2. They copy the link straight away. Only a hash is stored, so it can't be shown again.
   Links expire after 7 days, and the owner can revoke them from the same dialog.
3. The teammate opens the link, or pastes it into **Join workspace** on the dashboard.
   If they're signed out, they sign in or sign up first and are brought back to the link.
4. They review the invite and click **Join**.

Notes:

- An Editor link upgrades an existing Viewer. Links never downgrade anyone.
- Only the owner can create or revoke links. This is checked on the server.
- For local testing without the UI, `npm run member:add -- <projectId> <email> EDITOR`
  adds a member directly.

### Tests

```bash
npm run test:collab   # server tests: auth, room isolation, viewers, concurrency, restart
```

This uses `TEST_DATABASE_URL`, falling back to `DATABASE_URL`. It creates its own users
and projects with random ids and deletes them at the end.

### Deploying

- **Collab server:** deploy `npm run collab` (or `npx tsx collab/index.ts`) as a
  long-running Node service on a host that supports WebSockets (Fly.io, Render, Railway,
  a VM). Vercel functions can't host it. It needs `DATABASE_URL`, `BETTER_AUTH_SECRET`,
  `BETTER_AUTH_URL` and `COLLAB_ALLOWED_ORIGINS`.
- **Next.js app:** set `COLLAB_URL` to the public `wss://` URL of the collab server.
- **Run exactly one collab server instance.** Documents live in that process's memory.
  Running several needs a shared pub/sub, such as Hocuspocus's Redis extension.

## 5. Audio and video calls (Phase 5)

Workspace calls use LiveKit. Every project has one call room, and only project members can
join it.

### Set up LiveKit Cloud (one time)

1. Sign up at https://cloud.livekit.io and create a project (the free tier is enough).
2. Go to **Settings → Keys** and create an API key.
3. Copy the **WebSocket URL** (`wss://<project>.livekit.cloud`), the **API key** and the
   **API secret** into `.env`:

   ```bash
   LIVEKIT_URL="wss://<project>.livekit.cloud"
   LIVEKIT_API_KEY="<key>"
   LIVEKIT_API_SECRET="<secret>"   # server-only — never commit or share it
   ```

4. Restart `npm run dev` (or `npm run dev:all`).

You don't need to create rooms in the LiveKit dashboard. LiveKit creates a room when the
first person joins.

### How access works

- The browser asks the `getCallToken` server action for a token. The action checks:
  - you're signed in;
  - you're a member of the project (the same check as everything else);
  - you haven't hit the rate limit.
- The token is valid for 10 minutes. LiveKit refreshes it automatically during a call.
- Everything in the token comes from the server; the browser only sends the project id:

  | Field | Value |
  | --- | --- |
  | Room | `codelab-project-<projectId>` |
  | Identity | Your user id |
  | Name | Your account name, which you can't change from the browser |
  | Permissions | Taken from your role in the database |

- **Owners and editors** can publish their microphone and camera.
- **Viewers** can watch and listen, but not publish. To change this, edit
  `CALL_PERMISSIONS` in `src/calls/policy.ts`.
- Screen sharing and data messages are off.
- `LIVEKIT_API_SECRET` is only used on the server, in `src/calls/token.ts`.

### Using it

- Open a saved project → collaboration panel → **Join call**. You can set your mic and
  camera before joining. The camera is off by default.
- Inside a call you can mute and unmute, turn the camera on and off, and leave. Video tiles
  show names and a ring around whoever is speaking.
- Closing the panel doesn't end the call. The status bar shows **In call · N**.
- Problems get clear messages:
  - blocked microphone or camera permission, a missing device, or a device in use by
    another app;
  - pages that aren't secure (camera and mic need HTTPS or localhost);
  - a call server that can't be reached;
  - reconnecting, and losing the connection (with **Retry**);
  - joining from a second tab, which moves you to that tab;
  - mobile browsers blocking autoplay: tap **Tap to hear the call** to unmute.

### Tests

```bash
npm run test:calls   # who may join, token contents, room isolation, error messages
```

This uses `TEST_DATABASE_URL`, falling back to `DATABASE_URL`, and doesn't need a LiveKit
server or real keys.

### Deploying

Set the three `LIVEKIT_*` variables on the Next.js app. The collab server doesn't need them.

## Known limitations (this phase)

- **Rate limiting** for sign-in and sign-up is in memory, so limits are per server process.
  Move it to Redis or Postgres before running several instances.
- **Collaboration features:**
  - Invites, sharing settings and public visibility are stored or shown but not enforced.
    Access is members-only. People join through invite links. There's no UI yet to
    remove members or change their roles.
  - There is no email verification or password reset yet.
  - There is no code execution yet. Run and the terminal are simulated.
- **Calls:**
  - A member removed from a project stays in a call they've already joined until they
    leave or rejoin. Their next token request is refused.
  - One call session per user: joining from a second tab or device moves you there.
  - No screen sharing, chat or device picker yet.
- **Live editing:**
  - A member removed from a project keeps any connection that's already open until it
    reconnects. A token lasts at most 10 minutes, and membership is re-checked whenever
    the user reconnects.
  - Names and colours in presence come from the browser, so another member could
    display a different name. Room access itself never depends on them.
