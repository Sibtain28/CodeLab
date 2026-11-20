/**
 * CodeLab collaboration server (Yjs over WebSockets, powered by Hocuspocus).
 *
 * Runs as its own Node process next to Next.js (`npm run collab`), because
 * Next.js route handlers can't hold WebSocket connections.
 *
 * Security model
 * - Every document connection must present a token issued by the Next.js app
 *   (src/server/actions/collab.ts) after its normal session + membership check.
 * - The token is verified here (HMAC + expiry). The document name must parse
 *   as `project:<id>` or `file:<projectId>:<fileId>`, its project must match
 *   the token, and membership (and that the file belongs to the project) is
 *   re-checked in the database on every connection. Viewers are read-only.
 * - Nothing the client sends about identity is trusted: the user id comes
 *   from the signed token only.
 * - Logs never include tokens, secrets or document content.
 *
 * Persistence model
 * - `project_file.content` + `version` are the explicitly saved file (⌘S via
 *   the existing saveFile server action). This server never changes them.
 * - `project_file.ydoc` stores the live Yjs state, including unsaved shared
 *   edits, so reconnects and restarts continue the same document history
 *   instead of re-seeding (which would duplicate text).
 * - First open of a file with no ydoc: seed the Y.Text from `content` and
 *   store the ydoc immediately.
 * - Saves can also happen outside a live session (an editor whose live
 *   editing is off saves through the same saveFile action). The database
 *   stays the only source of truth: while documents are open, this server
 *   polls their saved versions and reconciles each document with the newer
 *   save (`reconcileWithSaved`). Nothing is pushed to this server, so there is
 *   no new endpoint or credential, and a document never changes from anything
 *   but the database row it is bound to.
 */
import { Server, type onAuthenticatePayload, type onLoadDocumentPayload, type onStoreDocumentPayload } from "@hocuspocus/server";
import * as Y from "yjs";
import type { Pool } from "pg";
import { verifyCollabToken } from "../src/collab/token";
import { hashText } from "../src/lib/collab/hash";
import { SAVED_KEY, TEXT_KEY, parseRoom } from "../src/lib/collab/rooms";

export interface CollabContext {
  userId: string;
  projectId: string;
  fileId: string | null;
  role: "OWNER" | "EDITOR" | "VIEWER";
}

export interface CollabServerOptions {
  port: number;
  /** PostgreSQL pool (plain `pg`, so this process doesn't need the Next.js Prisma client). */
  db: Pool;
  /** BETTER_AUTH_SECRET — the token key is derived from it. */
  secret: string;
  /** Exact origins allowed to open WebSockets (e.g. "http://localhost:3000"). */
  allowedOrigins: string[];
  /** onStoreDocument debounce, ms. */
  debounce?: number;
  maxDebounce?: number;
  log?: (message: string) => void;
  /** How often open documents are compared with their saved version, ms. */
  reconcileInterval?: number;
  /**
   * How long a draft must keep differing from a newer save before it is
   * flagged as a conflict, ms. Covers the moment between a live editor's own
   * save and its saved marker reaching this server.
   */
  conflictGrace?: number;
}

/** Transaction origin for changes this server makes to reconcile with a save. */
const RECONCILE_ORIGIN = { codelab: "reconcile-with-save" };

type SavedFile = { content: string; version: number };

/**
 * Brings a live document up to date with a newer explicit save, without ever
 * discarding unsaved shared edits. The saved marker (Y.Map SAVED_KEY) holds
 * `{ version, hash }` of the save the live text is based on, and `latest`
 * when a newer save conflicts with a draft.
 *
 * - The document already knows this version (or a newer one): nothing to do.
 * - The live text already equals the saved content: just move the marker.
 * - No unsaved shared edits (text matches its marker): show the saved content.
 * - A genuine draft: keep the text and its marker as they are, so the draft
 *   still shows as unsaved and a save of it still fails the version check.
 *   With `flagConflict`, record `latest` so every editor sees the conflict
 *   and chooses explicitly (keep the draft, or load the saved version).
 */
export function reconcileWithSaved(document: Y.Doc, file: SavedFile, { flagConflict }: { flagConflict: boolean }) {
  const saved = document.getMap(SAVED_KEY);
  const text = document.getText(TEXT_KEY);
  const known = saved.get("version");
  if (typeof known === "number" && known >= file.version) return "current" as const;

  const current = text.toString();
  if (current === file.content) {
    document.transact(() => {
      saved.set("version", file.version);
      saved.set("hash", hashText(file.content));
      if (saved.has("latest")) saved.delete("latest");
    }, RECONCILE_ORIGIN);
    return "marked" as const;
  }
  if (saved.get("hash") === hashText(current)) {
    document.transact(() => {
      text.delete(0, text.length);
      text.insert(0, file.content);
      saved.set("version", file.version);
      saved.set("hash", hashText(file.content));
      if (saved.has("latest")) saved.delete("latest");
    }, RECONCILE_ORIGIN);
    return "replaced" as const;
  }
  if (!flagConflict) return "draft" as const;
  if (saved.get("latest") !== file.version) {
    document.transact(() => saved.set("latest", file.version), RECONCILE_ORIGIN);
  }
  return "conflict" as const;
}

/** Rejected connections get this generic reason; details stay in server logs. */
class Forbidden extends Error {
  constructor(public readonly detail: string) {
    super("forbidden");
  }
}

export function createCollabServer(options: CollabServerOptions) {
  const { db, secret, allowedOrigins } = options;

  // All queries are parameterized; ids were already validated by parseRoom.
  async function memberRole(projectId: string, userId: string) {
    const { rows } = await db.query<{ role: CollabContext["role"] }>(
      'select role from project_member where "projectId" = $1 and "userId" = $2',
      [projectId, userId],
    );
    return rows[0]?.role ?? null;
  }
  async function fileExists(projectId: string, fileId: string) {
    const { rowCount } = await db.query('select 1 from project_file where id = $1 and "projectId" = $2', [fileId, projectId]);
    return (rowCount ?? 0) > 0;
  }
  async function readFile(projectId: string, fileId: string) {
    const { rows } = await db.query<{ content: string; version: number; ydoc: Buffer | null }>(
      'select content, version, ydoc from project_file where id = $1 and "projectId" = $2',
      [fileId, projectId],
    );
    return rows[0] ?? null;
  }
  async function writeState(projectId: string, fileId: string, document: Y.Doc) {
    await db.query('update project_file set ydoc = $1, "ydocUpdatedAt" = now() where id = $2 and "projectId" = $3', [
      Buffer.from(Y.encodeStateAsUpdate(document)),
      fileId,
      projectId,
    ]);
  }
  const log = options.log ?? ((message: string) => console.log(`[collab] ${message}`));

  async function authenticate({ token, documentName, connectionConfig }: onAuthenticatePayload<CollabContext>) {
    const claims = verifyCollabToken(token, secret);
    if (!claims) throw new Forbidden("invalid or expired token");

    const room = parseRoom(documentName);
    if (!room) throw new Forbidden("invalid room name");
    if (room.projectId !== claims.pid) throw new Forbidden("room/project mismatch");

    const role = await memberRole(room.projectId, claims.uid);
    if (!role) throw new Forbidden("not a member");
    if (room.kind === "file" && !(await fileExists(room.projectId, room.fileId))) {
      throw new Forbidden("file not in project");
    }
    if (role === "VIEWER") connectionConfig.readOnly = true;

    const context: CollabContext = {
      userId: claims.uid,
      projectId: room.projectId,
      fileId: room.kind === "file" ? room.fileId : null,
      role,
    };
    return context;
  }

  async function loadDocument({ document, documentName }: onLoadDocumentPayload<CollabContext>) {
    const room = parseRoom(documentName);
    if (!room || room.kind !== "file") return; // presence rooms hold no content

    const file = await readFile(room.projectId, room.fileId);
    if (!file) throw new Forbidden("file not found");

    const saved = document.getMap(SAVED_KEY);
    if (file.ydoc) {
      Y.applyUpdate(document, new Uint8Array(file.ydoc));
      // The database may have a newer save than this document knows about
      // (saved while live editing was off, or the marker update never arrived).
      const outcome = reconcileWithSaved(document, file, { flagConflict: true });
      if (outcome !== "current") await writeState(room.projectId, room.fileId, document);
      return;
    }

    // First collaborative open of this file: seed from the saved content and
    // persist right away so every later load shares this history.
    document.transact(() => {
      document.getText(TEXT_KEY).insert(0, file.content);
      saved.set("version", file.version);
      saved.set("hash", hashText(file.content));
    });
    await writeState(room.projectId, room.fileId, document);
  }

  async function storeDocument({ document, documentName }: onStoreDocumentPayload<CollabContext>) {
    const room = parseRoom(documentName);
    if (!room || room.kind !== "file") return;
    await writeState(room.projectId, room.fileId, document);
  }

  // ----- Reconciling open documents with saves made outside live editing -----
  // Drafts that differ from a newer save, by document name: flagged only once
  // they still differ after `conflictGrace` (a live editor's own save marker
  // may still be on its way).
  const pendingConflicts = new Map<string, { version: number; since: number }>();
  const conflictGrace = options.conflictGrace ?? 3000;
  let reconciling = false;

  async function reconcileOpenDocuments() {
    if (reconciling) return; // never overlap ticks
    reconciling = true;
    try {
      const open = new Map<string, { name: string; projectId: string; document: Y.Doc }>();
      for (const [name, document] of server.hocuspocus.documents) {
        const room = parseRoom(name);
        if (room?.kind === "file" && !document.isLoading) open.set(room.fileId, { name, projectId: room.projectId, document });
      }
      for (const name of pendingConflicts.keys()) {
        if (!server.hocuspocus.documents.has(name)) pendingConflicts.delete(name);
      }
      if (!open.size) return;

      // One cheap query for all open files; content is read only when needed.
      const { rows } = await db.query<{ id: string; projectId: string; version: number }>(
        'select id, "projectId", version from project_file where id = any($1::text[])',
        [[...open.keys()]],
      );
      for (const row of rows) {
        const entry = open.get(row.id);
        // The room's project must own the file (always true for rooms that passed auth).
        if (!entry || entry.projectId !== row.projectId) continue;
        const known = entry.document.getMap(SAVED_KEY).get("version");
        if (typeof known === "number" && known >= row.version) {
          pendingConflicts.delete(entry.name);
          continue;
        }
        const file = await readFile(entry.projectId, row.id);
        // The document may have been unloaded while we waited.
        if (!file || server.hocuspocus.documents.get(entry.name) !== entry.document) continue;

        const pending = pendingConflicts.get(entry.name);
        const graceOver = !!pending && pending.version === file.version && Date.now() - pending.since >= conflictGrace;
        const outcome = reconcileWithSaved(entry.document, file, { flagConflict: graceOver });
        if (outcome === "draft") {
          if (!pending || pending.version !== file.version) pendingConflicts.set(entry.name, { version: file.version, since: Date.now() });
        } else {
          pendingConflicts.delete(entry.name);
        }
        if (outcome === "replaced" || outcome === "conflict") {
          log(`${entry.name.slice(0, 16)}…: ${outcome === "replaced" ? "showing a newer save" : "a newer save conflicts with unsaved edits"} (v${file.version})`);
        }
      }
    } catch (error) {
      const code = (error as { code?: string }).code;
      console.error(`[collab] couldn't check open documents against saves: ${error instanceof Error ? error.name : "error"}${code ? ` ${code}` : ""}`);
    } finally {
      reconciling = false;
    }
  }

  const reconcileTimer = setInterval(() => void reconcileOpenDocuments(), options.reconcileInterval ?? 1500);
  reconcileTimer.unref();

  const server = new Server<CollabContext>({
    port: options.port,
    name: "codelab-collab",
    quiet: true,
    debounce: options.debounce ?? 2000,
    maxDebounce: options.maxDebounce ?? 10000,
    // Keep a document briefly after the last client leaves so a quick
    // reconnect doesn't reload it; pending stores still run first.
    unloadImmediately: false,
    stopOnSignals: false,
    websocketOptions: { maxPayload: 4 * 1024 * 1024 },

    async onUpgrade({ request, socket }) {
      const origin = request.headers.origin;
      if (origin && !allowedOrigins.includes(origin)) {
        // Origins aren't secret; naming it makes the fix obvious.
        log(`rejected connection from ${JSON.stringify(origin.slice(0, 100))}: not in allowed origins (${allowedOrigins.join(", ")}). Add it to COLLAB_ALLOWED_ORIGINS if it's yours.`);
        socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
        socket.destroy();
        // Hocuspocus treats a falsy rejection as "handled" (no rethrow).
        return Promise.reject(null);
      }
    },

    async onAuthenticate(data) {
      try {
        return await authenticate(data);
      } catch (error) {
        const detail = error instanceof Forbidden ? error.detail : "auth check failed";
        if (!(error instanceof Forbidden)) {
          const code = (error as { code?: string }).code;
          console.error(`[collab] auth check error: ${error instanceof Error ? error.name : ""}${code ? ` ${code}` : ""} (is DATABASE_URL reachable?)`);
        }
        log(`denied ${data.socketId.slice(0, 8)}: ${detail}`);
        throw new Error("forbidden");
      }
    },

    async onLoadDocument(data) {
      try {
        await loadDocument(data);
      } catch (error) {
        const code = (error as { code?: string }).code;
        log(
          code === "42703" || code === "42P01"
            ? `couldn't load a document: the database is missing a migration (${code}). Run "npx prisma migrate dev".`
            : `couldn't load a document: ${error instanceof Error ? error.name : "error"}${code ? ` ${code}` : ""}`,
        );
        throw error;
      }
    },

    async onStoreDocument(data) {
      try {
        await storeDocument(data);
      } catch (error) {
        console.error("[collab] failed to store document state", error instanceof Error ? error.name : "");
      }
    },

    async onDestroy() {
      clearInterval(reconcileTimer);
    },
  });
  return server;
}
