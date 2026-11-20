/**
 * Tests for member management and role controls (Phase 5.5):
 * - Viewing project members (Owner first, correct metadata)
 * - Owner invariants (cannot demote or remove Owner, cannot promote to Owner)
 * - Role transitions (Editor <-> Viewer)
 * - Scoping & Nonexistent targets
 * - Member removal and post-removal access denial
 * - Unauthorized mutations (non-owner restrictions)
 *
 * Run with: npm run test:members
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";
import {
  listProjectMembersDb,
  updateMemberRoleDb,
  removeProjectMemberDb,
} from "../src/server/members";
import { authorizeCall } from "../src/calls/authorize";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL! }) });

const cuid = () => "c" + randomBytes(16).toString("hex").slice(0, 24);
const uid = () => "u_memtest_" + randomBytes(8).toString("hex");

const ownerId = uid();
const editorId = uid();
const viewerId = uid();
const outsiderId = uid();
const otherProjectOwnerId = uid();

const projectA = cuid();
const projectB = cuid();

before(async () => {
  assert.ok(DATABASE_URL, "Set TEST_DATABASE_URL or DATABASE_URL");

  // Create test users
  for (const [id, name, email] of [
    [ownerId, "Oscar Owner", "owner@test.internal"],
    [editorId, "Emma Editor", "editor@test.internal"],
    [viewerId, "Victor Viewer", "viewer@test.internal"],
    [outsiderId, "Otis Outsider", "outsider@test.internal"],
    [otherProjectOwnerId, "Penny ProjectB", "other@test.internal"],
  ]) {
    await db.user.create({
      data: {
        id,
        name,
        email,
        emailVerified: false,
      },
    });
  }

  // Create Project A
  await db.project.create({
    data: {
      id: projectA,
      name: "project-a",
      language: "TypeScript",
      ownerId,
      members: {
        create: [
          { userId: ownerId, role: "OWNER" },
          { userId: editorId, role: "EDITOR" },
          { userId: viewerId, role: "VIEWER" },
        ],
      },
      files: {
        create: { path: "README.md", content: "# Project A" },
      },
    },
  });

  // Create Project B (different project)
  await db.project.create({
    data: {
      id: projectB,
      name: "project-b",
      language: "TypeScript",
      ownerId: otherProjectOwnerId,
      members: {
        create: [{ userId: otherProjectOwnerId, role: "OWNER" }],
      },
      files: {
        create: { path: "README.md", content: "# Project B" },
      },
    },
  });
});

after(async () => {
  await db.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
  await db.user.deleteMany({
    where: { id: { in: [ownerId, editorId, viewerId, outsiderId, otherProjectOwnerId] } },
  });
  await db.$disconnect();
});

describe("member management: list members", () => {
  test("lists all project members with Owner sorted first", async () => {
    const list = await listProjectMembersDb(db, projectA, ownerId);
    assert.equal(list.length, 3);

    // First member must always be the Owner
    assert.equal(list[0].userId, ownerId);
    assert.equal(list[0].isOwner, true);
    assert.equal(list[0].role, "Owner");
    assert.equal(list[0].isYou, true);
    assert.equal(list[0].name, "Oscar Owner");
    assert.equal(list[0].email, "owner@test.internal");

    const editor = list.find((m) => m.userId === editorId);
    assert.ok(editor);
    assert.equal(editor.role, "Editor");
    assert.equal(editor.isOwner, false);
    assert.equal(editor.isYou, false);

    const viewer = list.find((m) => m.userId === viewerId);
    assert.ok(viewer);
    assert.equal(viewer.role, "Viewer");
    assert.equal(viewer.isOwner, false);
  });

  test("correctly flags isYou when viewed by an editor", async () => {
    const list = await listProjectMembersDb(db, projectA, editorId);
    const me = list.find((m) => m.userId === editorId);
    assert.ok(me);
    assert.equal(me.isYou, true);

    const owner = list.find((m) => m.userId === ownerId);
    assert.ok(owner);
    assert.equal(owner.isYou, false);
  });
});

describe("member management: owner invariants", () => {
  test("owner cannot demote themselves", async () => {
    const result = await updateMemberRoleDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: ownerId,
      newRole: "VIEWER",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "The project owner's role cannot be changed.");

    // Verify role in database did not change
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: projectA, userId: ownerId } },
    });
    assert.equal(member?.role, "OWNER");
  });

  test("owner cannot remove themselves", async () => {
    const result = await removeProjectMemberDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: ownerId,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "The project owner cannot be removed.");

    // Verify owner membership still exists
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: projectA, userId: ownerId } },
    });
    assert.ok(member);
    assert.equal(member.role, "OWNER");
  });

  test("cannot target an OWNER record even if caller pretends to be owner of another project", async () => {
    const result = await removeProjectMemberDb(db, {
      projectId: projectA,
      ownerUserId: otherProjectOwnerId, // Penny is not owner of projectA
      targetUserId: ownerId,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "Only the project owner can remove members.");
  });
});

describe("member management: unauthorized mutations", () => {
  test("non-owner cannot change member roles", async () => {
    const result = await updateMemberRoleDb(db, {
      projectId: projectA,
      ownerUserId: editorId, // Emma is only an editor
      targetUserId: viewerId,
      newRole: "EDITOR",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "Only the project owner can manage member roles.");
  });

  test("non-owner cannot remove members", async () => {
    const result = await removeProjectMemberDb(db, {
      projectId: projectA,
      ownerUserId: editorId, // Emma is only an editor
      targetUserId: viewerId,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "Only the project owner can remove members.");

    // Verify viewer was not removed
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: projectA, userId: viewerId } },
    });
    assert.ok(member);
  });
});

describe("member management: role transitions", () => {
  test("owner can change an Editor to Viewer", async () => {
    const result = await updateMemberRoleDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: editorId,
      newRole: "VIEWER",
    });
    assert.equal(result.ok, true);

    const updated = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: projectA, userId: editorId } },
    });
    assert.equal(updated?.role, "VIEWER");

    // Call permission check reflects the new role
    const callAccess = await authorizeCall(db, editorId, projectA);
    assert.equal(callAccess.ok, true);
    assert.equal(callAccess.role, "VIEWER");
  });

  test("owner can change a Viewer to Editor", async () => {
    const result = await updateMemberRoleDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: editorId, // Change Emma back to Editor
      newRole: "EDITOR",
    });
    assert.equal(result.ok, true);

    const updated = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: projectA, userId: editorId } },
    });
    assert.equal(updated?.role, "EDITOR");

    const callAccess = await authorizeCall(db, editorId, projectA);
    assert.equal(callAccess.ok, true);
    assert.equal(callAccess.role, "EDITOR");
  });
});

describe("member management: scoping and nonexistent targets", () => {
  test("fails to change role of user not in project", async () => {
    const result = await updateMemberRoleDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: outsiderId,
      newRole: "VIEWER",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "This member was not found in the project.");
  });

  test("fails to change role of user belonging to a different project", async () => {
    const result = await updateMemberRoleDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: otherProjectOwnerId, // Penny is only in projectB
      newRole: "VIEWER",
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "This member was not found in the project.");
  });

  test("fails to remove user not in project", async () => {
    const result = await removeProjectMemberDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: outsiderId,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "This member was not found in the project.");
  });

  test("fails to remove user belonging to a different project", async () => {
    const result = await removeProjectMemberDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: otherProjectOwnerId,
    });
    assert.equal(result.ok, false);
    assert.equal(result.error, "This member was not found in the project.");
  });
});

describe("member management: member removal and post-removal access", () => {
  test("owner can remove a member, revoking subsequent access", async () => {
    // 1. Verify viewer currently has access
    const beforeCall = await authorizeCall(db, viewerId, projectA);
    assert.equal(beforeCall.ok, true);

    // 2. Owner removes viewer
    const result = await removeProjectMemberDb(db, {
      projectId: projectA,
      ownerUserId: ownerId,
      targetUserId: viewerId,
    });
    assert.equal(result.ok, true);

    // 3. Database row is deleted
    const member = await db.projectMember.findUnique({
      where: { projectId_userId: { projectId: projectA, userId: viewerId } },
    });
    assert.equal(member, null);

    // 4. Post-removal: Call authorization immediately denies access
    const afterCall = await authorizeCall(db, viewerId, projectA);
    assert.equal(afterCall.ok, false);
    assert.equal(afterCall.reason, "not_found");

    // 5. Member list no longer includes the removed member
    const list = await listProjectMembersDb(db, projectA, ownerId);
    assert.equal(list.length, 2);
    assert.ok(!list.some((m) => m.userId === viewerId));
  });
});
