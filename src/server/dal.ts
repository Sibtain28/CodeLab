import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import type { MemberRole } from "@/generated/prisma/client";
import { getAuth } from "./auth";
import { getDb } from "./db";

/**
 * Data Access Layer: the only place that turns a request into a verified
 * user, and the only place project access is decided. Every page, server
 * action and query that touches private data goes through here.
 */

export interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

/** Verifies the session cookie against the database. Deduped per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const session = await getAuth().api.getSession({ headers: await headers() });
  if (!session) return null;
  const { id, name, email } = session.user;
  return { id, name, email };
});

/** For pages: redirect to the login page when signed out. */
export async function requireUser(next?: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect(next ? `/login?next=${encodeURIComponent(next)}` : "/login");
  return user;
}

/** Project ids are cuids; reject anything else before touching the database. */
const PROJECT_ID = /^c[a-z0-9]{20,32}$/;
export function isProjectId(value: unknown): value is string {
  return typeof value === "string" && PROJECT_ID.test(value);
}

export class AccessError extends Error {
  constructor(public readonly reason: "unauthenticated" | "not_found" | "forbidden") {
    super(reason);
    this.name = "AccessError";
  }
}

const WRITE_ROLES: MemberRole[] = ["OWNER", "EDITOR"];

/**
 * Returns the caller's membership for a project, or throws AccessError.
 * Non-members get "not_found" (not "forbidden") so project ids can't be
 * probed for existence.
 */
export async function requireProjectAccess(
  projectId: unknown,
  { write = false }: { write?: boolean } = {},
) {
  const user = await getCurrentUser();
  if (!user) throw new AccessError("unauthenticated");
  if (!isProjectId(projectId)) throw new AccessError("not_found");

  const membership = await getDb().projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { role: true },
  });
  if (!membership) throw new AccessError("not_found");
  if (write && !WRITE_ROLES.includes(membership.role)) throw new AccessError("forbidden");
  return { user, projectId, role: membership.role };
}
