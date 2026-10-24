"use server";

import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import { FILE_CONTENT_MAX, MAX_FILES_PER_PROJECT, isValidFilePath } from "@/lib/projects";
import { SetupRequiredError } from "../config";
import { getDb } from "../db";
import { AccessError, requireProjectAccess } from "../dal";

export type SaveFileResult =
  | { ok: true; version: number }
  | { ok: false; reason: "conflict"; currentVersion: number; error: string }
  | { ok: false; reason: "error"; error: string };

export type CreateFileResult =
  | { ok: true; id: string; version: number }
  | { ok: false; error: string };

const path = z.string().refine(isValidFilePath, "Invalid file path.");

const saveSchema = z.object({
  projectId: z.string().max(64),
  path,
  content: z.string().max(FILE_CONTENT_MAX, "This file is too large to save."),
  /** The version the client's edits are based on. */
  baseVersion: z.number().int().positive(),
  /** Explicit "overwrite with my version" after a conflict. */
  overwrite: z.boolean().optional(),
});

function accessMessage(error: unknown) {
  if (error instanceof SetupRequiredError) return "The database isn't configured yet.";
  if (error instanceof AccessError) {
    if (error.reason === "unauthenticated") return "Your session has ended. Sign in again to save.";
    if (error.reason === "forbidden") return "You have view-only access to this project.";
    return "Project not found.";
  }
  return null;
}

/**
 * Saves one file with optimistic concurrency: the write only applies if the
 * stored version still equals `baseVersion`, so newer saved content is never
 * silently overwritten. `overwrite: true` is the user's explicit choice after
 * seeing a conflict.
 */
export async function saveFile(input: unknown): Promise<SaveFileResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, reason: "error", error: parsed.error.issues[0].message };
  const { path, content, baseVersion, overwrite } = parsed.data;

  try {
    const { user, projectId } = await requireProjectAccess(parsed.data.projectId, { write: true });
    const db = getDb();

    return await db.$transaction(async (tx) => {
      const where = overwrite ? { projectId, path } : { projectId, path, version: baseVersion };
      const updated = await tx.projectFile.updateMany({
        where,
        data: { content, version: { increment: 1 }, updatedById: user.id },
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
    });
  } catch (error) {
    const message = accessMessage(error);
    if (!message) console.error("saveFile failed", error);
    return { ok: false, reason: "error", error: message ?? "Couldn't save. Your changes are still here." };
  }
}

const createSchema = z.object({ projectId: z.string().max(64), path });

export async function createFile(input: unknown): Promise<CreateFileResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const { user, projectId } = await requireProjectAccess(parsed.data.projectId, { write: true });
    const db = getDb();
    const count = await db.projectFile.count({ where: { projectId } });
    if (count >= MAX_FILES_PER_PROJECT) return { ok: false, error: `Projects can hold up to ${MAX_FILES_PER_PROJECT} files.` };
    const file = await db.projectFile.create({
      data: { projectId, path: parsed.data.path, content: "", updatedById: user.id },
      select: { id: true, version: true },
    });
    await db.project.update({ where: { id: projectId }, data: { updatedAt: new Date() } });
    return { ok: true, id: file.id, version: file.version };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "A file with that name already exists." };
    }
    const message = accessMessage(error);
    if (!message) console.error("createFile failed", error);
    return { ok: false, error: message ?? "Couldn't create the file. Please try again." };
  }
}

export type ReadFileResult = { ok: true; content: string; version: number } | { ok: false; error: string };

/** Latest saved content of one file (used to resolve a save conflict). */
export async function readFile(input: unknown): Promise<ReadFileResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0].message };
  try {
    const { projectId } = await requireProjectAccess(parsed.data.projectId);
    const file = await getDb().projectFile.findUnique({
      where: { projectId_path: { projectId, path: parsed.data.path } },
      select: { content: true, version: true },
    });
    if (!file) return { ok: false, error: "This file no longer exists." };
    return { ok: true, ...file };
  } catch (error) {
    const message = accessMessage(error);
    if (!message) console.error("readFile failed", error);
    return { ok: false, error: message ?? "Couldn't load the file. Please try again." };
  }
}
