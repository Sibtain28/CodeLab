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
      // The database has a newer save than this document knows about (saved
      // while live editing was off, or the marker update never arrived).
      const known = saved.get("version");
      if (typeof known !== "number" || known < file.version) {
        const text = document.getText(TEXT_KEY);
        const current = text.toString();
        // No unsaved shared edits → show the newer saved content. If there
        // *are* unsaved shared edits, keep them (never discard work); they
        // show as unsaved against the new marker.
        const hasDraft = saved.get("hash") !== hashText(current);
        document.transact(() => {
          if (!hasDraft && current !== file.content) {
            text.delete(0, text.length);
            text.insert(0, file.content);
          }
          saved.set("version", file.version);
          saved.set("hash", hashText(file.content));
        });
        await writeState(room.projectId, room.fileId, document);
      }
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

  return new Server<CollabContext>({
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
  });
}
