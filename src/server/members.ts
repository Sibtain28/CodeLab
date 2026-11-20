import type { MemberRole, PrismaClient } from "@/generated/prisma/client";
import { colorFor, type MemberRoleLabel } from "@/lib/projects";

export const roleLabel: Record<MemberRole, MemberRoleLabel> = {
  OWNER: "Owner",
  EDITOR: "Editor",
  VIEWER: "Viewer",
};

export interface ProjectMemberSummary {
  id: string;
  userId: string;
  name: string;
  email: string;
  role: MemberRoleLabel;
  rawRole: MemberRole;
  color: ReturnType<typeof colorFor>;
  isOwner: boolean;
  isYou: boolean;
  createdAt: string;
}

export type MemberMutationResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Lists all members of a project.
 * Sorted with Owner first, then members in chronological join order.
 */
export async function listProjectMembersDb(
  db: PrismaClient,
  projectId: string,
  currentUserId: string,
): Promise<ProjectMemberSummary[]> {
  const members = await db.projectMember.findMany({
    where: { projectId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      role: true,
      createdAt: true,
      user: {
        select: { id: true, name: true, email: true },
      },
    },
  });

  const formatted: ProjectMemberSummary[] = members.map((m) => ({
    id: m.id,
    userId: m.user.id,
    name: m.user.name,
    email: m.user.email,
    role: roleLabel[m.role],
    rawRole: m.role,
    color: m.user.id === currentUserId ? "accent" : colorFor(m.user.id),
    isOwner: m.role === "OWNER",
    isYou: m.user.id === currentUserId,
    createdAt: m.createdAt.toISOString(),
  }));

  // Ensure owner is at the top of the list
  formatted.sort((a, b) => (a.isOwner ? -1 : b.isOwner ? 1 : 0));
  return formatted;
}

/**
 * Updates a member's role between EDITOR and VIEWER.
 * Invariant: Project owner cannot be demoted, and no user can be promoted to OWNER.
 */
export async function updateMemberRoleDb(
  db: PrismaClient,
  input: {
    projectId: string;
    ownerUserId: string;
    targetUserId: string;
    newRole: "EDITOR" | "VIEWER";
  },
): Promise<MemberMutationResult> {
  const { projectId, ownerUserId, targetUserId, newRole } = input;

  if (targetUserId === ownerUserId) {
    return { ok: false, error: "The project owner's role cannot be changed." };
  }

  return db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) return { ok: false, error: "Project not found." };
    if (project.ownerId !== ownerUserId) {
      return { ok: false, error: "Only the project owner can manage member roles." };
    }
    if (project.ownerId === targetUserId) {
      return { ok: false, error: "The project owner's role cannot be changed." };
    }

    const targetMember = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { id: true, role: true },
    });
    if (!targetMember) {
      return { ok: false, error: "This member was not found in the project." };
    }
    if (targetMember.role === "OWNER") {
      return { ok: false, error: "The project owner's role cannot be changed." };
    }

    await tx.projectMember.update({
      where: { id: targetMember.id },
      data: { role: newRole },
    });

    return { ok: true };
  });
}

/**
 * Removes a member from a project.
 * Invariant: Project owner can never be removed.
 */
export async function removeProjectMemberDb(
  db: PrismaClient,
  input: {
    projectId: string;
    ownerUserId: string;
    targetUserId: string;
  },
): Promise<MemberMutationResult> {
  const { projectId, ownerUserId, targetUserId } = input;

  if (targetUserId === ownerUserId) {
    return { ok: false, error: "The project owner cannot be removed." };
  }

  return db.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: { ownerId: true },
    });
    if (!project) return { ok: false, error: "Project not found." };
    if (project.ownerId !== ownerUserId) {
      return { ok: false, error: "Only the project owner can remove members." };
    }
    if (project.ownerId === targetUserId) {
      return { ok: false, error: "The project owner cannot be removed." };
    }

    const targetMember = await tx.projectMember.findUnique({
      where: { projectId_userId: { projectId, userId: targetUserId } },
      select: { id: true, role: true },
    });
    if (!targetMember) {
      return { ok: false, error: "This member was not found in the project." };
    }
    if (targetMember.role === "OWNER") {
      return { ok: false, error: "The project owner cannot be removed." };
    }

    await tx.projectMember.delete({
      where: { id: targetMember.id },
    });

    return { ok: true };
  });
}
