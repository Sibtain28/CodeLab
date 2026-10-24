"use client";

/**
 * Live collaboration for one project workspace (Yjs + Hocuspocus).
 *
 * - One WebSocket per workspace, shared by every room.
 * - A presence room (`project:<id>`) says who is here and which file they
 *   have open.
 * - One shared document per *open* file (`file:<projectId>:<fileId>`); closing
 *   a tab leaves its room. The server persists each document, so nothing is
 *   lost when a room is left with unsaved edits.
 * - Tokens come from the `getCollabToken` server action on every (re)connect;
 *   the collab server verifies them and re-checks membership.
 */
import { HocuspocusProvider, HocuspocusProviderWebsocket, WebSocketStatus } from "@hocuspocus/provider";
import { useEffect, useReducer, useRef, useState } from "react";
import * as Y from "yjs";
import type { CollabUser } from "@/lib/collab/cursors";
import { SAVED_KEY, TEXT_KEY, fileRoom, projectRoom } from "@/lib/collab/rooms";
import type { PeerColor } from "@/lib/mock/people";
import { getCollabToken } from "@/server/actions/collab";

export type CollabStatus = "connecting" | "connected" | "offline" | "denied";

export interface FileSession {
  path: string;
  doc: Y.Doc;
  text: Y.Text;
  saved: Y.Map<unknown>;
  provider: HocuspocusProvider;
  synced: boolean;
  denied: boolean;
  /**
   * The live document for this file couldn't be loaded (refused, or no sync
   * within the timeout). The provider is stopped and the file is edited
   * without live sync for the rest of this visit, so a late sync can never
   * overwrite edits made in the meantime.
   */
  failed: boolean;
}

/** How long to wait for the collab server before falling back to normal editing. */
const CONNECT_TIMEOUT_MS = 8000;
// Generous: the first open of a file waits on the database (e.g. a cold Neon).
const SYNC_TIMEOUT_MS = 15000;

export interface PresencePeer {
  clientId: number;
  user: CollabUser;
  file: string | null;
}

const COLORS: PeerColor[] = ["accent", "violet", "sky", "amber", "rose"];
const isColor = (c: unknown): c is PeerColor => COLORS.includes(c as PeerColor);

/** Remote awareness states are untrusted input: keep only well-formed fields. */
function readUser(state: Record<string, unknown>): CollabUser | null {
  const u = state.user as Partial<CollabUser> | undefined;
  if (!u || typeof u.id !== "string" || typeof u.name !== "string") return null;
  return { id: u.id.slice(0, 64), name: u.name.slice(0, 80), color: isColor(u.color) ? u.color : "sky" };
}

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * A COLLAB_URL of ws://localhost:… only works on the machine running the
 * servers. When the app is opened from another device (e.g. the dev
 * server's "Network" address), connect to the same host the page came from.
 */
function resolveCollabUrl(url: string) {
  try {
    const target = new URL(url);
    const page = window.location.hostname;
    if (LOOPBACK.has(target.hostname) && page && !LOOPBACK.has(page)) target.hostname = page;
    return target.toString();
  } catch {
    return url;
  }
}

export interface UseCollaborationOptions {
  /** Absent → collaboration is off (demo, or no collab server configured). */
  url: string | null;
  projectId: string;
  me: CollabUser;
  /** Open files with their database ids. */
  openFiles: { path: string; fileId: string }[];
  activePath: string | null;
  /** A reason live editing can't work, known before connecting (skips the wait). */
  knownProblem?: string | null;
  onText: (path: string, text: string) => void;
  onSaved: (path: string, saved: { version: number; hash: string }) => void;
}

export function useCollaboration({
  url: configuredUrl,
  projectId,
  me,
  openFiles,
  activePath,
  knownProblem = null,
  onText,
  onSaved,
}: UseCollaborationOptions) {
  // Don't even try when the server already reported why it can't work.
  const url = knownProblem ? null : configuredUrl;
  const [status, setStatus] = useState<CollabStatus>("connecting");
  /** Set once live editing is given up for this visit; the reason is shown to the user. */
  const [failure, setFailure] = useState<string | null>(null);
  const [peers, setPeers] = useState<PresencePeer[]>([]);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const socketRef = useRef<HocuspocusProviderWebsocket | null>(null);
  const presenceRef = useRef<HocuspocusProvider | null>(null);
  const sessions = useRef(new Map<string, FileSession>());
  const callbacks = useRef({ onText, onSaved });
  useEffect(() => {
    callbacks.current = { onText, onSaved };
  });

  // Token fetcher shared by all rooms. Failing here makes the server reject
  // the connection, which surfaces as "denied".
  const token = useRef(async () => {
    const result = await getCollabToken(projectId).catch(() => null);
    return result?.ok ? result.token : "";
  });

  // Socket + presence room for the lifetime of the workspace view.
  useEffect(() => {
    if (!url) return;
    const sessionMap = sessions.current;
    // Retry forever with backoff. Note: `delay` must not be below `minDelay`
    // (default 1000), or the retry helper never makes a first attempt.
    const target = resolveCollabUrl(url);
    const socket = new HocuspocusProviderWebsocket({
      url: target,
      maxAttempts: 0,
      delay: 500,
      minDelay: 500,
      maxDelay: 8000,
    });
    socketRef.current = socket;
    const onStatus = ({ status: s }: { status: WebSocketStatus }) =>
      setStatus((prev) =>
        prev === "denied" ? prev : s === WebSocketStatus.Connected ? "connected" : s === WebSocketStatus.Connecting ? "connecting" : "offline",
      );
    socket.on("status", onStatus);

    let stopped = false;
    let connectedOnce = false;
    // Give up (for this visit) instead of leaving the editor waiting forever.
    const stop = (reason: string) => {
      if (stopped) return;
      stopped = true;
      console.warn(`[CodeLab] Live editing unavailable: ${reason}`);
      sessionMap.forEach((s) => {
        s.provider.destroy();
        s.doc.destroy();
      });
      sessionMap.clear();
      presence.destroy();
      socket.destroy();
      socketRef.current = null;
      presenceRef.current = null;
      setFailure(reason);
    };
    const markConnected = ({ status: s }: { status: WebSocketStatus }) => {
      if (s === WebSocketStatus.Connected) connectedOnce = true;
    };
    socket.on("status", markConnected);
    const connectTimer = window.setTimeout(() => {
      if (!connectedOnce) {
        stop(`couldn't reach the live collaboration server at ${target}. If you're running CodeLab locally, start it with "npm run collab".`);
      }
    }, CONNECT_TIMEOUT_MS);

    const presence = new HocuspocusProvider({
      websocketProvider: socket,
      name: projectRoom(projectId),
      document: new Y.Doc(),
      token: () => token.current(),
      onAuthenticationFailed: () => {
        setStatus("denied");
        stop("the live collaboration server refused this session. Check the collab server's log.");
      },
      onAuthenticated: () => setStatus("connected"),
    });
    presence.attach();
    presenceRef.current = presence;

    const awareness = presence.awareness!;
    const syncPeers = () => {
      const list: PresencePeer[] = [];
      awareness.getStates().forEach((state, clientId) => {
        if (clientId === awareness.clientID) return;
        const user = readUser(state);
        if (!user) return;
        const file = typeof state.file === "string" ? state.file.slice(0, 200) : null;
        list.push({ clientId, user, file });
      });
      setPeers(list);
    };
    awareness.on("change", syncPeers);

    return () => {
      window.clearTimeout(connectTimer);
      socket.off("status", markConnected);
      stopped = true;
      awareness.off("change", syncPeers);
      sessionMap.forEach((s) => {
        s.provider.destroy();
        s.doc.destroy();
      });
      sessionMap.clear();
      presence.destroy();
      socket.off("status", onStatus);
      socket.destroy();
      socketRef.current = null;
      presenceRef.current = null;
      setPeers([]);
      setStatus("connecting");
      setFailure(null);
    };
  }, [url, projectId]);

  // Publish who I am and which file I'm looking at.
  useEffect(() => {
    const awareness = presenceRef.current?.awareness;
    if (!awareness) return;
    awareness.setLocalStateField("user", me);
    awareness.setLocalStateField("file", activePath);
  }, [me, activePath, status]);

  // One shared document per open file.
  const openKey = openFiles.map((f) => `${f.path}\u0000${f.fileId}`).join("\u0001");
  useEffect(() => {
    const socket = socketRef.current;
    if (!url || !socket) return;
    const map = sessions.current;
    const wanted = new Map(openFiles.map((f) => [f.path, f.fileId]));

    // Leave rooms for closed tabs (or files whose id changed).
    for (const [path, session] of map) {
      if (wanted.get(path) && session.provider.configuration.name === fileRoom(projectId, wanted.get(path)!)) continue;
      session.provider.destroy();
      session.doc.destroy();
      map.delete(path);
    }

    // Join rooms for newly opened tabs.
    for (const [path, fileId] of wanted) {
      if (map.has(path)) continue;
      const doc = new Y.Doc();
      const text = doc.getText(TEXT_KEY);
      const saved = doc.getMap<unknown>(SAVED_KEY);
      const provider = new HocuspocusProvider({
        websocketProvider: socket,
        name: fileRoom(projectId, fileId),
        document: doc,
        token: () => token.current(),
      });
      const session: FileSession = { path, doc, text, saved, provider, synced: false, denied: false, failed: false };
      const giveUp = () => {
        if (session.synced || session.failed || map.get(path) !== session) return;
        session.failed = true;
        provider.destroy();
        console.warn(`[CodeLab] Live editing unavailable for ${path}; editing without live sync.`);
        rerender();
      };
      const syncTimer = window.setTimeout(giveUp, SYNC_TIMEOUT_MS);
      provider.on("destroy", () => window.clearTimeout(syncTimer));
      provider.on("synced", ({ state }: { state: boolean }) => {
        if (!state || session.synced || session.failed) return;
        window.clearTimeout(syncTimer);
        session.synced = true;
        callbacks.current.onText(path, text.toString());
        reportSaved();
        rerender();
      });
      provider.on("authenticationFailed", () => {
        session.denied = true;
        giveUp();
      });
      text.observe(() => {
        if (session.synced) callbacks.current.onText(path, text.toString());
      });
      const reportSaved = () => {
        const version = saved.get("version");
        const hash = saved.get("hash");
        if (typeof version === "number" && typeof hash === "string") callbacks.current.onSaved(path, { version, hash });
      };
      saved.observe(() => {
        if (session.synced) reportSaved();
      });
      provider.awareness?.setLocalStateField("user", me);
      provider.attach();
      map.set(path, session);
    }
    rerender();
    // openKey captures openFiles; `me` changes are pushed separately.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url, projectId, openKey]);

  return {
    enabled: !!configuredUrl,
    status,
    failure: knownProblem ?? failure,
    peers,
    session: (path: string | null) => (path ? (sessions.current.get(path) ?? null) : null),
    hasUnsyncedChanges: () => [...sessions.current.values()].some((s) => s.provider.hasUnsyncedChanges),
  };
}
