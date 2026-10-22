import "server-only";
import type { MemberRole, ProjectVisibility } from "@/generated/prisma/client";
import {
  LANGUAGES,
  colorFor,
  type Language,
  type MemberRoleLabel,
  type ProjectSummary,
  type Visibility,
} from "@/lib/projects";
import { getDb } from "./db";
import { requireProjectAccess, type CurrentUser } from "./dal";
import { formatRelative } from "./format";

export const roleLabel: Record<MemberRole, MemberRoleLabel> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export const visibilityToDb: Record<Visibility, ProjectVisibility> = {
  private: "PRIVATE",
  team: "TEAM",
  public: "PUBLIC",
};
const visibilityFromDb: Record<ProjectVisibility, Visibility> = {
  PRIVATE: "private",
  TEAM: "team",
  PUBLIC: "public",
};

function asLanguage(value: string): Language {
  return (LANGUAGES as readonly string[]).includes(value) ? (value as Language) : "TypeScript";
}

/** Every project the user is a member of, most recently changed first. */
export async function listProjects(user: CurrentUser): Promise<ProjectSummary[]> {
  const memberships = await getDb().projectMember.findMany({
    where: { userId: user.id },
    orderBy: { project: { updatedAt: "desc" } },
    select: {
      role: true,
      starred: true,
      project: {
        select: {
          id: true,
          name: true,
          description: true,
          language: true,
          framework: true,
          visibility: true,
          updatedAt: true,
          members: {
            where: { userId: { not: user.id } },
            orderBy: { createdAt: "asc" },
            take: 8,
            select: { role: true, user: { select: { id: true, name: true } } },
          },
          files: {
            orderBy: { updatedAt: "desc" },
            take: 1,
            select: { updatedBy: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });

  const now = new Date();
  return memberships.map(({ role, starred, project: p }) => {
    const editor = p.files[0]?.updatedBy;
    return {
      id: p.id,
      name: p.name,
      description: p.description,
      language: asLanguage(p.language),
      framework: p.framework,
      visibility: visibilityFromDb[p.visibility],
      role: roleLabel[role],
      starred,
      updatedAt: p.updatedAt.toISOString(),
      updatedLabel: formatRelative(p.updatedAt, now),
      lastEditedBy: editor ? (editor.id === user.id ? "You" : editor.name) : null,
      others: p.members.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        color: colorFor(m.user.id),
        role: roleLabel[m.role],
      })),
    };
  });
}

export interface WorkspaceFile {
  path: string;
  content: string;
  version: number;
}

export interface WorkspaceData {
  id: string;
  name: string;
  description: string;
  language: Language;
  framework: string;
  role: MemberRoleLabel;
  canWrite: boolean;
  files: WorkspaceFile[];
  members: { id: string; name: string; color: ReturnType<typeof colorFor>; role: MemberRoleLabel; isYou: boolean }[];
}

/** Loads a workspace after checking membership. Throws AccessError otherwise. */
export async function loadWorkspace(projectId: unknown): Promise<WorkspaceData> {
  const access = await requireProjectAccess(projectId);
  const project = await getDb().project.findUniqueOrThrow({
    where: { id: access.projectId },
    select: {
      id: true,
      name: true,
      description: true,
      language: true,
      framework: true,
      files: { orderBy: { path: "asc" }, select: { path: true, content: true, version: true } },
      members: {
        orderBy: { createdAt: "asc" },
        select: { role: true, user: { select: { id: true, name: true } } },
      },
    },
  });
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    language: asLanguage(project.language),
    framework: project.framework,
    role: roleLabel[access.role],
    canWrite: access.role !== "VIEWER",
    files: project.files,
    members: project.members.map((m) => ({
      id: m.user.id,
      name: m.user.name,
      color: m.user.id === access.user.id ? "accent" : colorFor(m.user.id),
      role: roleLabel[m.role],
      isYou: m.user.id === access.user.id,
    })),
  };
}
