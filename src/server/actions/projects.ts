"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { Prisma } from "@/generated/prisma/client";
import {
  LANGUAGES,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_PATTERN,
  VISIBILITIES,
  defaultFramework,
} from "@/lib/projects";
import { SetupRequiredError } from "../config";
import { getDb } from "../db";
import { AccessError, getCurrentUser, requireProjectAccess } from "../dal";
import { visibilityToDb } from "../projects";
import { starterFiles } from "../starter-files";

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? object : { data: T }))
  | { ok: false; error: string; field?: string };

const createSchema = z.object({
  name: z.string().trim().regex(PROJECT_NAME_PATTERN, "Use 3–40 lowercase letters, numbers or dashes."),
  description: z.string().trim().max(PROJECT_DESCRIPTION_MAX, `Use ${PROJECT_DESCRIPTION_MAX} characters or fewer.`),
  language: z.enum(LANGUAGES),
  visibility: z.enum(VISIBILITIES),
});

function failure(error: unknown): { ok: false; error: string } {
  if (error instanceof SetupRequiredError) return { ok: false, error: "The database isn't configured yet." };
  if (error instanceof AccessError) {
    return {
      ok: false,
      error: error.reason === "unauthenticated" ? "Your session has ended. Sign in again." : "Project not found.",
    };
  }
  console.error(error);
  return { ok: false, error: "Something went wrong. Please try again." };
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: issue.message, field: String(issue.path[0] ?? "") };
  }
  try {
    const user = await getCurrentUser();
    if (!user) throw new AccessError("unauthenticated");
    const { name, description, language, visibility } = parsed.data;

    const project = await getDb().project.create({
      data: {
        name,
        description: description || "A fresh CodeLab project.",
        language,
        framework: defaultFramework[language],
        visibility: visibilityToDb[visibility],
        ownerId: user.id,
        // Owner membership is created in the same transaction as the project.
        members: { create: { userId: user.id, role: "OWNER" } },
        files: {
          create: starterFiles(name, language).map((f) => ({ ...f, updatedById: user.id })),
        },
      },
      select: { id: true },
    });
    revalidatePath("/dashboard");
    return { ok: true, data: { id: project.id } };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return { ok: false, error: "You already have a project with this name.", field: "name" };
    }
    return failure(error);
  }
}

const starSchema = z.object({ projectId: z.string().max(64), starred: z.boolean() });

/** Stars are per user: they live on the caller's own membership row. */
export async function setProjectStar(input: unknown): Promise<ActionResult> {
  const parsed = starSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  try {
    const { user, projectId } = await requireProjectAccess(parsed.data.projectId);
    await getDb().projectMember.update({
      where: { projectId_userId: { projectId, userId: user.id } },
      data: { starred: parsed.data.starred },
    });
    return { ok: true };
  } catch (error) {
    return failure(error);
  }
}
