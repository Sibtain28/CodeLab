/**
 * Integration tests for the collaboration server: authentication, room
 * isolation, read-only viewers, concurrent edits and persistence.
 *
 * Run with: npm run test:collab
 *
 * Uses TEST_DATABASE_URL (or DATABASE_URL) with the CodeLab schema applied.
 * It creates its own users/projects with random ids and deletes them at the end.
 */
import "dotenv/config";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { after, before, describe, test } from "node:test";
import { HocuspocusProvider, HocuspocusProviderWebsocket } from "@hocuspocus/provider";
import { Pool } from "pg";
import WebSocket from "ws";
import * as Y from "yjs";
import { createCollabServer } from "../collab/server";
import { signCollabToken } from "../src/collab/token";
import { hashText } from "../src/lib/collab/hash";
import { SAVED_KEY, TEXT_KEY, fileRoom, projectRoom } from "../src/lib/collab/rooms";

const DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
const SECRET = "test-secret-" + randomBytes(16).toString("hex");
const ORIGIN = "http://localhost:3000";

const cuid = () => "c" + randomBytes(16).toString("hex").slice(0, 24);
const uid = () => "u_test_" + randomBytes(8).toString("hex");
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitFor(check: () => boolean, ms = 4000, label = "condition") {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (check()) return;
    await sleep(25);
  }
  assert.fail(`timed out waiting for ${label}`);
}

const db = new Pool({ connectionString: DATABASE_URL, max: 3 });

// Fixture ids
const alice = uid(); // owner of project A
const bob = uid(); // editor on project A
const vera = uid(); // viewer on project A
const mallory = uid(); // owner of project B only
const projectA = cuid();
const projectB = cuid();
const fileA1 = cuid();
const fileA2 = cuid();
const fileB1 = cuid();
const fileA3 = cuid();

const token = (userId: string, projectId: string, exp = Date.now() + 60_000) =>
  signCollabToken({ uid: userId, pid: projectId, exp }, SECRET);

let server: ReturnType<typeof createCollabServer>;
let port = 0;
let sockets = new Set<import("node:net").Socket>();

/** Like a process exit: stop the server and drop every TCP connection. */
async function killServer() {
  await server.destroy();
  sockets.forEach((socket) => socket.destroy());
  sockets = new Set();
}
const open: Array<{ destroy(): void }> = [];

async function startServer(fixedPort = 0) {
  server = createCollabServer({
    port: fixedPort,
    db,
    secret: SECRET,
    allowedOrigins: [ORIGIN],
    debounce: 100,
    maxDebounce: 300,
    log: () => {},
  });
  server.httpServer.on("connection", (socket) => sockets.add(socket));
  await server.listen(fixedPort);
  port = server.address.port;
}

/** Connects one client; resolves when synced or rejected. */
function connect(name: string, tok: string | null, { reconnect = false } = {}) {
  const socket = new HocuspocusProviderWebsocket({
    url: `ws://127.0.0.1:${port}`,
    WebSocketPolyfill: WebSocket,
    maxAttempts: reconnect ? 0 : 1, // 0 = retry forever
    delay: 100,
    minDelay: 100,
    maxDelay: 500,
  });
  const doc = new Y.Doc();
  let denied = false;
  let synced = false;
  const provider = new HocuspocusProvider({
    websocketProvider: socket,
    name,
    document: doc,
    token: tok,
    onAuthenticationFailed: () => {
      denied = true;
    },
    onSynced: () => {
      synced = true;
    },
  });
  provider.attach();
  const handle = {
    doc,
    provider,
    text: () => doc.getText(TEXT_KEY).toString(),
    get denied() {
      return denied;
    },
    get synced() {
      return synced;
    },
    result: async () => {
      await waitFor(() => denied || synced, 5000, `${name} sync/deny`);
      return denied ? "denied" : "synced";
    },
    destroy() {
      provider.destroy();
      socket.destroy();
    },
  };
  open.push(handle);
  return handle;
}

before(async () => {
  assert.ok(DATABASE_URL, "Set TEST_DATABASE_URL or DATABASE_URL");
  for (const [id, name] of [
    [alice, "Alice"],
    [bob, "Bob"],
    [vera, "Vera"],
    [mallory, "Mallory"],
  ]) {
    await db.query('insert into "user" (id, name, email, "updatedAt") values ($1, $2, $3, now())', [id, name, `${id}@test.local`]);
  }
  for (const [id, owner] of [
    [projectA, alice],
    [projectB, mallory],
  ]) {
    await db.query('insert into project (id, name, language, "ownerId", "updatedAt") values ($1, $2, $3, $4, now())', [
      id,
      `test-${id.slice(-6)}`,
      "TypeScript",
      owner,
    ]);
  }
  for (const [p, u, role] of [
    [projectA, alice, "OWNER"],
    [projectA, bob, "EDITOR"],
    [projectA, vera, "VIEWER"],
    [projectB, mallory, "OWNER"],
  ]) {
    await db.query('insert into project_member (id, "projectId", "userId", role) values ($1, $2, $3, $4)', [cuid(), p, u, role]);
  }
  for (const [id, p, path, content] of [
    [fileA1, projectA, "a.ts", "const a = 1;\n"],
    [fileA2, projectA, "b.ts", "const b = 2;\n"],
    [fileA3, projectA, "c.ts", "const c = 3;\n"],
    [fileB1, projectB, "secret.ts", "TOP SECRET\n"],
  ]) {
    await db.query('insert into project_file (id, "projectId", path, content, "updatedAt") values ($1, $2, $3, $4, now())', [id, p, path, content]);
  }
  await startServer();
});

after(async () => {
  open.forEach((h) => h.destroy());
  await server?.destroy();
  await db.query('delete from "user" where id = any($1)', [[alice, bob, vera, mallory]]); // cascades
  await db.end();
});

describe("authentication and authorization", () => {
  test("rejects a missing token", async () => {
    assert.equal(await connect(fileRoom(projectA, fileA1), null).result(), "denied");
  });

  test("rejects garbage, tampered and expired tokens", async () => {
    assert.equal(await connect(fileRoom(projectA, fileA1), "nonsense").result(), "denied");
    const valid = token(alice, projectA);
    const tampered = valid.slice(0, -2) + (valid.endsWith("A") ? "BB" : "AA");
    assert.equal(await connect(fileRoom(projectA, fileA1), tampered).result(), "denied");
    const forged = signCollabToken({ uid: alice, pid: projectA, exp: Date.now() + 60_000 }, "wrong-secret");
    assert.equal(await connect(fileRoom(projectA, fileA1), forged).result(), "denied");
    assert.equal(await connect(fileRoom(projectA, fileA1), token(alice, projectA, Date.now() - 1)).result(), "denied");
  });

  test("rejects a token for another project (room/project mismatch)", async () => {
    const h = connect(fileRoom(projectB, fileB1), token(alice, projectA));
    assert.equal(await h.result(), "denied");
    assert.equal(h.text(), "", "no content leaked");
  });

  test("rejects a non-member even with a correctly signed token", async () => {
    // Simulates a token minted before the user was removed from the project.
    const h = connect(fileRoom(projectB, fileB1), token(alice, projectB));
    assert.equal(await h.result(), "denied");
    assert.equal(h.text(), "");
  });

  test("rejects a file id that belongs to another project", async () => {
    const h = connect(fileRoom(projectA, fileB1), token(alice, projectA));
    assert.equal(await h.result(), "denied");
    assert.equal(h.text(), "");
  });

  test("rejects malformed room names", async () => {
    for (const name of ["file:../../etc", `file:${projectA}`, `project:${projectA}:x`, "anything"]) {
      assert.equal(await connect(name, token(alice, projectA)).result(), "denied", name);
    }
  });

  test("rejects WebSocket upgrades from other origins", async () => {
    const ws = new WebSocket(`ws://127.0.0.1:${port}`, { headers: { Origin: "https://evil.example" } });
    const outcome = await new Promise<string>((resolve) => {
      ws.on("open", () => resolve("open"));
      ws.on("error", () => resolve("rejected"));
      ws.on("unexpected-response", () => resolve("rejected"));
    });
    ws.terminate();
    assert.equal(outcome, "rejected");
  });

  test("members can join the presence room", async () => {
    assert.equal(await connect(projectRoom(projectA), token(bob, projectA)).result(), "synced");
  });
});

describe("collaborative editing", () => {
  test("first open seeds from saved content and records the saved marker", async () => {
    const h = connect(fileRoom(projectA, fileA1), token(alice, projectA));
    assert.equal(await h.result(), "synced");
    assert.equal(h.text(), "const a = 1;\n");
    const saved = h.doc.getMap(SAVED_KEY);
    assert.equal(saved.get("version"), 1);
    assert.equal(saved.get("hash"), hashText("const a = 1;\n"));
    const { rows } = await db.query("select ydoc is not null as stored from project_file where id = $1", [fileA1]);
    assert.equal(rows[0].stored, true, "seed state persisted immediately");
  });

  test("simultaneous edits from two users merge without losing either", async () => {
    const a = connect(fileRoom(projectA, fileA1), token(alice, projectA));
    const b = connect(fileRoom(projectA, fileA1), token(bob, projectA));
    assert.equal(await a.result(), "synced");
    assert.equal(await b.result(), "synced");
    // Both type at the same moment, at the same position.
    a.doc.getText(TEXT_KEY).insert(0, "// alice\n");
    b.doc.getText(TEXT_KEY).insert(0, "// bob\n");
    await waitFor(() => a.text() === b.text() && a.text().includes("alice") && a.text().includes("bob"), 4000, "convergence");
    assert.ok(a.text().endsWith("const a = 1;\n"));
    assert.equal(a.text().length, "// alice\n// bob\nconst a = 1;\n".length);
  });

  test("rooms are isolated: edits to one file never reach another", async () => {
    const one = connect(fileRoom(projectA, fileA1), token(alice, projectA));
    const two = connect(fileRoom(projectA, fileA2), token(bob, projectA));
    assert.equal(await one.result(), "synced");
    assert.equal(await two.result(), "synced");
    one.doc.getText(TEXT_KEY).insert(0, "ONLY-IN-A1 ");
    await sleep(500);
    assert.equal(two.text(), "const b = 2;\n");
  });

  test("viewers can read but their edits are not applied", async () => {
    const owner = connect(fileRoom(projectA, fileA2), token(alice, projectA));
    const viewer = connect(fileRoom(projectA, fileA2), token(vera, projectA));
    assert.equal(await owner.result(), "synced");
    assert.equal(await viewer.result(), "synced");
    assert.equal(viewer.text(), owner.text(), "viewer can read");
    viewer.doc.getText(TEXT_KEY).insert(0, "VIEWER WAS HERE ");
    await sleep(600);
    assert.ok(!owner.text().includes("VIEWER WAS HERE"), "viewer write rejected");
    const late = connect(fileRoom(projectA, fileA2), token(bob, projectA));
    assert.equal(await late.result(), "synced");
    assert.ok(!late.text().includes("VIEWER WAS HERE"));
    owner.doc.getText(TEXT_KEY).insert(0, "// owner edit\n");
    await waitFor(() => viewer.text().includes("// owner edit"), 4000, "viewer receives updates");
  });
});

describe("persistence and reconnects", () => {
  test("unsaved shared edits survive a server restart without duplicating text", async () => {
    const fixedPort = port;
    const a = connect(fileRoom(projectA, fileA1), token(alice, projectA), { reconnect: true });
    assert.equal(await a.result(), "synced");
    a.doc.getText(TEXT_KEY).insert(a.text().length, "// before restart\n");
    const expected = a.text();
    await sleep(600); // let the debounced store run

    open.filter((h) => h !== a).forEach((h) => h.destroy());
    await killServer();
    await startServer(fixedPort);

    // A fresh client loads the stored state.
    const fresh = connect(fileRoom(projectA, fileA1), token(bob, projectA));
    assert.equal(await fresh.result(), "synced");
    assert.equal(fresh.text(), expected);

    // The original client reconnects on its own and merges without duplication.
    a.doc.getText(TEXT_KEY).insert(0, "// while offline\n");
    await waitFor(() => fresh.text().startsWith("// while offline"), 8000, "reconnect sync");
    assert.equal(fresh.text(), "// while offline\n" + expected);
    assert.equal(a.text(), fresh.text());
  });

  test("the saved marker tracks the database version on load", async () => {
    // Simulate an explicit save that happened while no server was running.
    open.forEach((h) => h.destroy());
    await sleep(300);
    await db.query("update project_file set content = $1, version = version + 1 where id = $2", ["saved!", fileA2]);
    const fixedPort = port;
    await killServer();
    await startServer(fixedPort);
    const h = connect(fileRoom(projectA, fileA2), token(alice, projectA));
    assert.equal(await h.result(), "synced");
    assert.equal(h.doc.getMap(SAVED_KEY).get("version"), 2);
    assert.equal(h.doc.getMap(SAVED_KEY).get("hash"), hashText("saved!"));
    // The live text is kept (it holds unsaved shared edits), never silently replaced.
    assert.ok(h.text().includes("const b = 2;"));
  });

  test("with no unsaved shared edits, a newer save replaces the live text", async () => {
    const first = connect(fileRoom(projectA, fileA3), token(alice, projectA));
    assert.equal(await first.result(), "synced");
    assert.equal(first.text(), "const c = 3;\n");
    first.destroy();
    await sleep(300);
    await db.query("update project_file set content = $1, version = version + 1 where id = $2", ["const c = 4;\n", fileA3]);
    const fixedPort = port;
    await killServer();
    await startServer(fixedPort);
    const h = connect(fileRoom(projectA, fileA3), token(bob, projectA));
    assert.equal(await h.result(), "synced");
    assert.equal(h.text(), "const c = 4;\n");
    assert.equal(h.doc.getMap(SAVED_KEY).get("hash"), hashText("const c = 4;\n"));
  });
});
