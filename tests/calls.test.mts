/**
 * Tests for workspace call access: who may get a LiveKit token, what the
 * token allows, and that rooms are isolated per workspace.
 *
 * Run with: npm run test:calls
 *
 * Uses TEST_DATABASE_URL (or DATABASE_URL) with the CodeLab schema applied.
 * Creates its own users/projects with random ids and deletes them at the end.
 * No LiveKit server is needed: tokens are verified locally with the SDK.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { PrismaPg } from "@prisma/adapter-pg";
import { TokenVerifier } from "livekit-server-sdk";
import { PrismaClient } from "../src/generated/prisma/client";
import { authorizeCall } from "../src/calls/authorize";
import { CALL_TOKEN_TTL_SECONDS, callRoomName } from "../src/calls/policy";
import { createCallToken, readLiveKitConfig, type LiveKitConfig } from "../src/calls/token";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL! }) });

// Test-only credentials; never real ones.
const config: LiveKitConfig = {
  url: "wss://example.livekit.cloud",
  apiKey: "test_api_key",
  apiSecret: "test-secret-" + randomBytes(24).toString("hex"),
};
const verifier = new TokenVerifier(config.apiKey, config.apiSecret);

const cuid = () => "c" + randomBytes(16).toString("hex").slice(0, 24);
const uid = () => "u_calltest_" + randomBytes(8).toString("hex");

const owner = uid();
const editor = uid();
const viewer = uid();
const outsider = uid();
const projectA = cuid();
const projectB = cuid();

before(async () => {
  assert.ok(DATABASE_URL, "Set TEST_DATABASE_URL or DATABASE_URL");
  for (const [id, name] of [
    [owner, "Olive Owner"],
    [editor, "Eddie Editor"],
    [viewer, "Vera Viewer"],
    [outsider, "Otto Outsider"],
  ]) {
    await db.user.create({ data: { id, name, email: `${id}@test.local` } });
  }
  await db.project.create({
    data: {
      id: projectA,
      name: `call-a-${projectA.slice(-6)}`,
      language: "TypeScript",
      ownerId: owner,
      members: {
        create: [
          { userId: owner, role: "OWNER" },
          { userId: editor, role: "EDITOR" },
          { userId: viewer, role: "VIEWER" },
        ],
      },
    },
  });
  await db.project.create({
    data: {
      id: projectB,
      name: `call-b-${projectB.slice(-6)}`,
      language: "TypeScript",
      ownerId: outsider,
      members: { create: [{ userId: outsider, role: "OWNER" }] },
    },
  });
});

after(async () => {
  await db.user.deleteMany({ where: { id: { in: [owner, editor, viewer, outsider] } } }); // cascades
  await db.$disconnect();
});

describe("who can join a workspace call", () => {
  test("owners, editors and viewers of the project are allowed, with their own role", async () => {
    assert.deepEqual(await authorizeCall(db, owner, projectA), { ok: true, role: "OWNER" });
    assert.deepEqual(await authorizeCall(db, editor, projectA), { ok: true, role: "EDITOR" });
    assert.deepEqual(await authorizeCall(db, viewer, projectA), { ok: true, role: "VIEWER" });
  });

  test("a non-member is refused, exactly like a missing project", async () => {
    const denied = await authorizeCall(db, outsider, projectA);
    const missing = await authorizeCall(db, outsider, cuid());
    assert.deepEqual(denied, { ok: false, reason: "not_found" });
    assert.deepEqual(missing, denied);
  });

  test("membership in one project gives no access to another", async () => {
    assert.deepEqual(await authorizeCall(db, owner, projectB), { ok: false, reason: "not_found" });
    assert.deepEqual(await authorizeCall(db, outsider, projectA), { ok: false, reason: "not_found" });
  });

  test("malformed or non-string project ids are refused before any lookup", async () => {
    for (const bad of ["", "../projects", `${projectA} OR 1=1`, projectA.toUpperCase(), 42, null, { id: projectA }]) {
      assert.deepEqual(await authorizeCall(db, owner, bad), { ok: false, reason: "not_found" }, String(bad));
    }
  });

  test("removing a member revokes access for new tokens", async () => {
    const temp = uid();
    await db.user.create({ data: { id: temp, name: "Temp", email: `${temp}@test.local` } });
    await db.projectMember.create({ data: { projectId: projectA, userId: temp, role: "EDITOR" } });
    assert.equal((await authorizeCall(db, temp, projectA)).ok, true);
    await db.projectMember.delete({ where: { projectId_userId: { projectId: projectA, userId: temp } } });
    assert.deepEqual(await authorizeCall(db, temp, projectA), { ok: false, reason: "not_found" });
    await db.user.delete({ where: { id: temp } });
  });
});

describe("what a call token allows", () => {
  test("token is bound to the server-verified user and this workspace's room only", async () => {
    const { token, roomName } = await createCallToken(config, projectA, { id: editor, name: "Eddie Editor", role: "EDITOR" });
    const claims = await verifier.verify(token);
    assert.equal(claims.sub, editor, "identity is the user id");
    assert.equal(claims.name, "Eddie Editor");
    assert.equal(claims.video?.room, callRoomName(projectA));
    assert.equal(roomName, `codelab-project-${projectA}`);
    assert.equal(claims.video?.roomJoin, true);
    assert.ok(!claims.video?.roomAdmin && !claims.video?.roomCreate && !claims.video?.roomList, "no admin rights");
    assert.equal(claims.video?.canUpdateOwnMetadata, false, "can't rename themselves or change their role");
    assert.equal(claims.video?.canPublishData, false);
    assert.deepEqual(JSON.parse(claims.metadata ?? "{}"), { role: "editor" });
  });

  test("tokens are short-lived", async () => {
    const { token } = await createCallToken(config, projectA, { id: owner, name: "Olive Owner", role: "OWNER" });
    const claims = (await verifier.verify(token)) as { exp?: number; nbf?: number };
    assert.ok(claims.exp && claims.nbf);
    assert.ok(claims.exp - claims.nbf <= CALL_TOKEN_TTL_SECONDS, "expires within 10 minutes");
  });

  test("owners and editors may publish microphone and camera only", async () => {
    for (const role of ["OWNER", "EDITOR"] as const) {
      const { token, canPublish } = await createCallToken(config, projectA, { id: owner, name: "X", role });
      const grant = (await verifier.verify(token)).video!;
      assert.equal(canPublish, true);
      assert.equal(grant.canPublish, true);
      assert.deepEqual([...(grant.canPublishSources ?? [])].sort(), ["camera", "microphone"]);
      assert.equal(grant.canSubscribe, true);
    }
  });

  test("viewers can watch and listen but not publish", async () => {
    const { token, canPublish } = await createCallToken(config, projectA, { id: viewer, name: "Vera Viewer", role: "VIEWER" });
    const grant = (await verifier.verify(token)).video!;
    assert.equal(canPublish, false);
    assert.equal(grant.canPublish, false);
    assert.equal(grant.canSubscribe, true);
    assert.deepEqual(grant.canPublishSources ?? [], []);
  });

  test("each workspace gets its own room; ids can't be smuggled into the name", async () => {
    assert.notEqual(callRoomName(projectA), callRoomName(projectB));
    assert.equal(callRoomName(projectA), callRoomName(projectA), "stable across calls");
    for (const bad of [`${projectA}-x`, "codelab-project-x", "../../other", ""]) {
      assert.throws(() => callRoomName(bad), /invalid project id/, bad);
    }
  });

  test("a token signed with another secret is rejected", async () => {
    const { token } = await createCallToken({ ...config, apiSecret: "attacker-secret-" + "x".repeat(32) }, projectA, {
      id: owner,
      name: "Olive Owner",
      role: "OWNER",
    });
    await assert.rejects(verifier.verify(token));
  });

  test("the API secret never appears in the token", async () => {
    const { token } = await createCallToken(config, projectA, { id: owner, name: "Olive Owner", role: "OWNER" });
    const decoded = token
      .split(".")
      .slice(0, 2)
      .map((part) => Buffer.from(part, "base64url").toString("utf8"))
      .join("");
    assert.ok(!decoded.includes(config.apiSecret));
  });
});

describe("configuration", () => {
  test("missing or invalid settings are reported by name only", () => {
    const missing = readLiveKitConfig({});
    assert.equal(missing.ok, false);
    if (!missing.ok) assert.deepEqual(missing.problems.length, 3);

    const secret = "super-secret-value-123";
    const bad = readLiveKitConfig({ LIVEKIT_URL: "https://not-a-websocket", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: secret });
    assert.equal(bad.ok, false);
    if (!bad.ok) {
      assert.match(bad.problems.join(), /LIVEKIT_URL must start with wss:\/\//);
      assert.ok(!bad.problems.join().includes(secret), "never echoes values");
    }

    const good = readLiveKitConfig({ LIVEKIT_URL: "wss://x.livekit.cloud", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" });
    assert.equal(good.ok, true);
  });
});

describe("call error messages", async () => {
  // livekit-client is a browser SDK; its error helpers work without WebRTC.
  const { describeMediaError, describeDisconnect, describeTokenError } = await import(
    "../src/components/workspace/call/messages"
  );
  const { DisconnectReason } = await import("livekit-client");
  const domError = (name: string) => Object.assign(new Error(name), { name });

  test("permission denial, missing devices and busy devices get specific guidance", () => {
    assert.match(describeMediaError(domError("NotAllowedError"), "microphone"), /Microphone access is blocked/);
    assert.match(describeMediaError(domError("NotFoundError"), "camera"), /No camera was found/);
    assert.match(describeMediaError(domError("NotReadableError"), "camera"), /being used by another app/);
    assert.match(describeMediaError(new Error("weird"), "microphone"), /Couldn't start your microphone/);
  });

  test("leaving on purpose is silent; other disconnects explain what happened", () => {
    assert.equal(describeDisconnect(DisconnectReason.CLIENT_INITIATED), null);
    assert.match(describeDisconnect(DisconnectReason.DUPLICATE_IDENTITY) ?? "", /another tab or device/);
    assert.match(describeDisconnect(DisconnectReason.PARTICIPANT_REMOVED) ?? "", /removed/);
    assert.match(describeDisconnect(undefined) ?? "", /connection was lost/);
  });

  test("token failures map to clear messages without leaking server details", () => {
    assert.match(describeTokenError({ ok: false, reason: "not_configured", error: "x" }), /aren't set up/);
    assert.match(describeTokenError({ ok: false, reason: "not_found", error: "x" }), /no longer have access/);
    assert.match(describeTokenError({ ok: false, reason: "unauthenticated", error: "x" }), /session has ended/);
  });
});
