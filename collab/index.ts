/**
 * Entry point for the collaboration server: `npm run collab`.
 *
 * Reads the same .env as the Next.js app. Required: DATABASE_URL,
 * BETTER_AUTH_SECRET, BETTER_AUTH_URL. Optional: COLLAB_PORT (default 1234),
 * COLLAB_ALLOWED_ORIGINS (comma-separated; defaults to BETTER_AUTH_URL's origin).
 */
import "dotenv/config";
import { Pool } from "pg";
import { createCollabServer } from "./server";

/** BETTER_AUTH_URL's origin; for localhost also its 127.0.0.1 / [::1] spellings. */
function defaultOrigins(authUrl: string) {
  const url = new URL(authUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) return url.origin;
  return ["localhost", "127.0.0.1", "[::1]"]
    .map((host) => `${url.protocol}//${host}${url.port ? `:${url.port}` : ""}`)
    .join(",");
}

async function main() {
  const missing = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"].filter((k) => !process.env[k]?.trim());
  if (missing.length) {
    console.error(`[collab] Missing environment variables: ${missing.join(", ")}. See SETUP.md.`);
    process.exit(1);
  }

  const port = Number(process.env.COLLAB_PORT ?? 1234);
  const allowedOrigins = (process.env.COLLAB_ALLOWED_ORIGINS ?? defaultOrigins(process.env.BETTER_AUTH_URL!))
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);

  const db = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  db.on("error", (error) => console.error("[collab] database pool error", error.name));
  // Fail fast with a clear message instead of refusing every connection later.
  try {
    await db.query('select id, ydoc, "ydocUpdatedAt" from project_file limit 0');
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";
    const hint =
      code === "42703" || code === "42P01"
        ? 'The database is missing a migration. Run "npx prisma migrate dev", then start the collab server again.'
        : "Couldn't reach the database. Check DATABASE_URL and your network.";
    console.error(`[collab] ${hint} (${error instanceof Error ? error.name : "error"}${code ? ` ${code}` : ""})`);
    await db.end().catch(() => {});
    process.exit(1);
  }

  const server = createCollabServer({ port, db, secret: process.env.BETTER_AUTH_SECRET!, allowedOrigins });

  await server.listen();
  console.log(`[collab] listening on ws://localhost:${port} (allowed origins: ${allowedOrigins.join(", ")})`);

  let stopping = false;
  const shutdown = async () => {
    if (stopping) return;
    stopping = true;
    console.log("[collab] shutting down — saving live document state…");
    await server.destroy(); // closes connections and flushes pending stores
    await db.end();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error) => {
  console.error("[collab] failed to start:", error instanceof Error ? error.message : error);
  process.exit(1);
});
