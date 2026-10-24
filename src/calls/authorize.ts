/**
 * Who may join a workspace call: members of the project, with their role
 * from the database. Takes the Prisma client as a parameter so it can be
 * tested directly against a database.
 */
import type { PrismaClient } from "@/generated/prisma/client";
import type { CallRole } from "./policy";

const PROJECT_ID = /^c[a-z0-9]{20,32}$/;

export type CallAccess = { ok: true; role: CallRole } | { ok: false; reason: "not_found" };

export async function authorizeCall(db: PrismaClient, userId: string, projectId: unknown): Promise<CallAccess> {
  if (typeof projectId !== "string" || !PROJECT_ID.test(projectId)) return { ok: false, reason: "not_found" };
  const membership = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId } },
    select: { role: true },
  });
  // Non-members get the same answer as a missing project (ids can't be probed).
  if (!membership) return { ok: false, reason: "not_found" };
  return { ok: true, role: membership.role };
}
