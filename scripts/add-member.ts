/**
 * Local admin helper (there's no invite UI yet): add an existing user to a project.
 *
 *   npm run member:add -- <projectId> <email> [EDITOR|VIEWER]
 *
 * The project id is the last part of the workspace URL (/workspace/<projectId>).
 * Uses DATABASE_URL from .env. Prints no secrets.
 */
import "dotenv/config";
import { randomBytes } from "node:crypto";
import { Pool } from "pg";

async function main() {
  const [projectId, email, roleArg = "EDITOR"] = process.argv.slice(2);
  const role = roleArg.toUpperCase();
  if (!projectId || !email || !["EDITOR", "VIEWER"].includes(role)) {
    console.error("Usage: npm run member:add -- <projectId> <email> [EDITOR|VIEWER]");
    process.exit(1);
  }
  const db = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const project = await db.query<{ name: string }>("select name from project where id = $1", [projectId]);
    if (!project.rowCount) throw new Error("No project with that id.");
    const user = await db.query<{ id: string; name: string }>('select id, name from "user" where lower(email) = lower($1)', [email]);
    if (!user.rowCount) throw new Error("No user with that email — they need to sign up first.");
    const id = "c" + randomBytes(16).toString("hex").slice(0, 24);
    const result = await db.query(
      `insert into project_member (id, "projectId", "userId", role) values ($1, $2, $3, $4)
       on conflict ("projectId", "userId") do update set role = excluded.role where project_member.role <> 'OWNER'
       returning role`,
      [id, projectId, user.rows[0].id, role],
    );
    if (!result.rowCount) throw new Error("That user owns the project; their role wasn't changed.");
    console.log(`${user.rows[0].name} is now ${result.rows[0].role} on ${project.rows[0].name}.`);
  } finally {
    await db.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
