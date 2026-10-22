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

## Known limitations (this phase)

- **Rate limiting** for sign-in and sign-up is in memory, so limits are per server process.
  Move it to Redis or Postgres before running several instances.
- **Collaboration features:**
  - Invites, sharing settings and public visibility are stored or shown but not enforced.
    Access is members-only.
  - There is no email verification or password reset yet.
  - There is no live co-editing (Yjs), calls (LiveKit) or code execution yet. Run and the
    terminal are simulated.
