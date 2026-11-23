/**
 * The database side of saving a file: optimistic concurrency on `version`.
 * Used by the `saveFile` server action after its session and membership
 * checks. Takes the Prisma client as a parameter so it can be tested directly
 * against a database (tests/collab.test.ts).
 *
 * Callers must have already verified that `userId` may write to `projectId`.
 */
import type { PrismaClient } from "@/generated/prisma/client";

export type VersionedSaveResult =
  | { ok: true; version: number }
  | { ok: false; reason: "conflict"; currentVersion: number; error: string }
  | { ok: false; reason: "error"; error: string };

export interface VersionedSave {
  projectId: string;
  path: string;
  content: string;
  /** The version the caller's edits are based on. */
  baseVersion: number;
  /** Explicit "overwrite with my version" after a conflict. */
  overwrite?: boolean;
  userId: string;
}

/**
 * The write only applies if the stored version still equals `baseVersion`,
 * so newer saved content is never silently overwritten. `overwrite: true` is
 * the user's explicit choice after seeing a conflict.
 */
export function saveFileVersioned(db: PrismaClient, input: VersionedSave): Promise<VersionedSaveResult> {
  const { projectId, path, content, baseVersion, overwrite, userId } = input;
  return db.$transaction(
    async (tx) => {
      const where = overwrite ? { projectId, path } : { projectId, path, version: baseVersion };
      const updated = await tx.projectFile.updateMany({
        where,
        data: { content, version: { increment: 1 }, updatedById: userId },
      });
      const current = await tx.projectFile.findUnique({
        where: { projectId_path: { projectId, path } },
        select: { version: true },
      });
      if (!current) return { ok: false as const, reason: "error" as const, error: "This file no longer exists." };
      if (updated.count === 0) {
        return {
          ok: false as const,
          reason: "conflict" as const,
          currentVersion: current.version,
          error: "A newer version of this file was saved elsewhere.",
        };
      }
      await tx.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
      return { ok: true as const, version: current.version };
    },
    { maxWait: 15000, timeout: 15000 },
  );
}
