"use client";

import { ChevronRight, Eye, FileCode2, Keyboard, LoaderCircle, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { LogoMark } from "@/components/brand/logo";
import { AvatarStack } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { languageFromPath, languageLabel } from "@/lib/highlight";
import { remoteCursors } from "@/lib/collab/cursors";
import { hashText } from "@/lib/collab/hash";
import type { Problem, WorkspaceMe, WorkspaceMeta, WorkspacePeer } from "@/lib/mock/workspace";
import { colorFor } from "@/lib/projects";
import {
  createFile as createFileAction,
  readFile as readFileAction,
  saveFile as saveFileAction,
} from "@/server/actions/files";
import { useMediaQuery } from "@/lib/use-media-query";
import {
  BottomPanel,
  type BottomTab,
  type DiagnosticFix,
  type OutputLine,
  type TerminalLine,
} from "./bottom-panel";
import { CodeEditor, type EditorCommand, type EditorPeerCursor } from "./code-editor";
import { CollaborationPanel, type CallState } from "./collaboration-panel";
import { EditorTabs } from "./editor-tabs";
import { FileExplorer, allFolders } from "./file-explorer";
import { InviteDialog, type PendingInvite } from "./invite-dialog";
import { ResizeHandle } from "./resize-handle";
import { StatusBar } from "./status-bar";
import { Toolbar, type RunState, type Visibility } from "./toolbar";
import type { LiveCallState } from "./call/live-call";
import { ProjectInviteDialog } from "./project-invite-dialog";
import { useCollaboration } from "./use-collaboration";

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

/** The LiveKit client only loads for saved projects (never for the demo). */
const LiveCall = dynamic(() => import("./call/live-call"), { ssr: false });

function without<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

const METRIC_CARD = "src/components/MetricCard.tsx";
const ERROR_SNIPPET = "formatDelta(delta)";
const WARNING_SNIPPET = "delta && delta >= 0";

/**
 * Mock diagnostics: a hand-written check for the two seeded issues in
 * MetricCard.tsx. Positions are recomputed as you type so markers follow
 * edits. Real diagnostics will come from Monaco's TypeScript worker.
 */
function computeProblems(files: Record<string, string>): Problem[] {
  const source = files[METRIC_CARD];
  if (source === undefined) return [];
  const result: Problem[] = [];
  source.split("\n").forEach((text, i) => {
    const errIdx = text.indexOf(ERROR_SNIPPET);
    if (errIdx !== -1) {
      result.push({
        file: METRIC_CARD,
        line: i + 1,
        col: errIdx + "formatDelta(".length + 1,
        severity: "error",
        message:
          "Argument of type 'number | undefined' is not assignable to parameter of type 'number'.",
        code: "ts(2345)",
      });
    }
    const warnIdx = text.indexOf(WARNING_SNIPPET);
    if (warnIdx !== -1) {
      result.push({
        file: METRIC_CARD,
        line: i + 1,
        col: warnIdx + 1,
        severity: "warning",
        message: "A delta of exactly 0 is falsy, so a flat metric renders as trending down.",
        code: "logic",
      });
    }
  });
  return result.sort((a, b) => (a.severity === b.severity ? a.line - b.line : a.severity === "error" ? -1 : 1));
}

const initialTerminal: TerminalLine[] = [
  { id: 1, kind: "system", text: "Simulated terminal — commands run in your browser only. Type `help` to see what's available." },
  { id: 2, kind: "input", text: "git status" },
  { id: 3, kind: "output", text: "On branch main\nYour branch is up to date with 'origin/main'." },
];

/**
 * Present for real projects: files are loaded from and saved to the database.
 * Absent for the public demo, which keeps everything in memory.
 */
export interface WorkspacePersistence {
  projectId: string;
  canWrite: boolean;
  /** Saved version of each file, used to detect conflicting saves. */
  versions: Record<string, number>;
  /** Database id of each file (collaboration rooms are keyed by it). */
  fileIds: Record<string, string>;
  /** The signed-in user's id (for presence colours; never trusted by the server). */
  userId: string;
  /** WebSocket URL of the collab server, or null when live editing is off. */
  collabUrl: string | null;
  /** Set when the app server already knows live editing can't work (local dev). */
  collabProblem?: string | null;
  /** True when LiveKit is configured on the server (calls can be joined). */
  callsConfigured: boolean;
}

export function WorkspaceIDE({
  workspace,
  me,
  initialFiles,
  initialTabs,
  peers,
  persistence,
}: {
  workspace: WorkspaceMeta;
  me: WorkspaceMe;
  initialFiles: Record<string, string>;
  initialTabs: string[];
  peers: WorkspacePeer[];
  persistence?: WorkspacePersistence;
}) {
  const toast = useToast();
  const isDemo = !persistence;
  const canWrite = persistence?.canWrite ?? true;
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Between 1024px and 1280px three columns leave the editor too narrow, so the
  // collaboration panel starts closed there until the user opens it.
  const isWide = useMediaQuery("(min-width: 1280px)");

  // Files. `savedHash` fingerprints the last content known to be stored (in
  // the database for real projects, in memory for the demo); a file is dirty
  // when its current text hashes differently. With live collaboration the
  // saved fingerprint is shared through the document, so every collaborator's
  // unsaved indicator clears when anyone saves.
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [savedHash, setSavedHash] = useState<Record<string, string>>(() =>
    Object.fromEntries(Object.entries(initialFiles).map(([p, c]) => [p, hashText(c)])),
  );
  const [fileIds, setFileIds] = useState<Record<string, string>>(persistence?.fileIds ?? {});
  const [versions, setVersions] = useState<Record<string, number>>(persistence?.versions ?? {});
  const [saving, setSaving] = useState<Set<string>>(() => new Set());
  const savingRef = useRef(new Set<string>());
  const [conflicts, setConflicts] = useState<Record<string, { currentVersion: number }>>({});
  const [tabs, setTabs] = useState<string[]>(initialTabs);
  const [active, setActive] = useState<string | null>(initialTabs[0] ?? null);
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(allFolders(Object.keys(initialFiles))));
  const [cursor, setCursor] = useState<{ line: number; col: number } | null>({ line: 1, col: 1 });
  const [reveal, setReveal] = useState<{ line: number; nonce: number } | null>(null);

  // Layout
  const [explorerOpen, setExplorerOpen] = useState(true);
  const [collabPref, setCollabPref] = useState<boolean | null>(null);
  const collabOpen = collabPref ?? isWide;
  const [mobileExplorer, setMobileExplorer] = useState(false);
  const [mobileCollab, setMobileCollab] = useState(false);
  const [bottomOpen, setBottomOpen] = useState(true);
  const [bottomTab, setBottomTab] = useState<BottomTab>("terminal");
  const [explorerWidth, setExplorerWidth] = useState(248);
  const [collabWidth, setCollabWidth] = useState(300);
  const [bottomHeight, setBottomHeight] = useState(220);

  // Collaboration (mock)
  const [call, setCall] = useState<CallState>({ joined: false, mic: true, camera: false, screen: false });
  // Real calls (saved projects): the call UI renders into a slot in the panel.
  const [callSlot, setCallSlot] = useState<HTMLDivElement | null>(null);
  const [liveCall, setLiveCall] = useState<LiveCallState>({ joined: false, participants: 0 });
  const [inviteOpen, setInviteOpen] = useState(false);
  const [invites, setInvites] = useState<PendingInvite[]>([]);
  const [visibility, setVisibility] = useState<Visibility>("team");

  // Run / terminal (simulated)
  const [runState, setRunState] = useState<RunState>("idle");
  const [output, setOutput] = useState<OutputLine[]>([]);
  const [terminal, setTerminal] = useState<TerminalLine[]>(initialTerminal);
  const lineId = useRef(100);
  const timers = useRef<number[]>([]);

  useEffect(() => {
    const pending = timers.current;
    return () => pending.forEach((t) => window.clearTimeout(t));
  }, []);

  const paths = useMemo(() => Object.keys(files), [files]);
  const dirty = useMemo(
    () => new Set(paths.filter((p) => hashText(files[p]) !== savedHash[p])),
    [paths, files, savedHash],
  );

  // ----- Live collaboration (real projects with a collab server) -----------
  const collabMe = useMemo(
    () => ({ id: persistence?.userId ?? "demo", name: me.name, color: colorFor(persistence?.userId ?? "demo") }),
    [persistence?.userId, me.name],
  );
  const openFiles = useMemo(
    () => tabs.flatMap((path) => (fileIds[path] ? [{ path, fileId: fileIds[path] }] : [])),
    [tabs, fileIds],
  );
  const collab = useCollaboration({
    url: persistence?.collabUrl ?? null,
    knownProblem: persistence?.collabProblem ?? null,
    projectId: persistence?.projectId ?? "",
    me: collabMe,
    openFiles,
    activePath: active,
    onText: (path, text) => setFiles((f) => (f[path] === text ? f : { ...f, [path]: text })),
    onSaved: (path, marker) => {
      setSavedHash((h) => (h[path] === marker.hash ? h : { ...h, [path]: marker.hash }));
      setVersions((v) => (v[path] === marker.version ? v : { ...v, [path]: marker.version }));
      setConflicts((c) => (c[path] ? without(c, path) : c));
    },
  });
  // Live editing is on unless it was given up for this visit (server not
  // reachable or refused). A single file can also fall back if its document
  // never loads. Fallback = Phase 3 editing: local edits + version-checked saves.
  const live = collab.enabled && !collab.failure;
  const liveSessionFor = (path: string | null) => {
    if (!live || !path) return null;
    const session = collab.session(path);
    return session?.failed ? null : session;
  };
  const isLivePath = (path: string | null) => live && !!path && !collab.session(path)?.failed;
  const activeSession = liveSessionFor(active);
  const liveReady = !isLivePath(active) || !!activeSession?.synced;
  const liveOffReason = !collab.enabled
    ? null
    : collab.failure
      ? `Live editing is off: ${collab.failure}`
      : active && collab.session(active)?.failed
        ? "Live editing is off for this file: the live server didn't load it in time."
        : null;

  // Tell the user once when live editing falls back.
  const announcedFailure = useRef(false);
  useEffect(() => {
    if (!collab.failure || announcedFailure.current) return;
    announcedFailure.current = true;
    toast({
      tone: "warning",
      title: "Live editing unavailable",
      duration: 15000,
      description: `${collab.failure.charAt(0).toUpperCase()}${collab.failure.slice(1)} You can keep editing — ⌘S saves normally. Reload to try again.`,
    });
  }, [collab.failure, toast]);

  // Remote cursors in the active file, recomputed on awareness and text changes.
  const [cursorTick, bumpCursors] = useState(0);
  useEffect(() => {
    const awareness = activeSession?.provider.awareness;
    if (!activeSession || !awareness) return;
    const bump = () => bumpCursors((n) => n + 1);
    awareness.on("change", bump);
    activeSession.text.observe(bump);
    return () => {
      awareness.off("change", bump);
      activeSession.text.unobserve(bump);
    };
  }, [activeSession, activeSession?.synced]);
  // Sample diagnostics only exist for the demo's seeded file.
  const problems = useMemo(() => (isDemo ? computeProblems(files) : []), [isDemo, files]);
  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.length - errors;

  const explorerVisible = isDesktop ? explorerOpen : mobileExplorer;
  const collabVisible = isDesktop ? collabOpen : mobileCollab;

  const activeLanguage = active ? languageFromPath(active) : null;
  const editorPeers = useMemo<EditorPeerCursor[]>(() => {
    if (live) {
      const awareness = activeSession?.provider.awareness;
      return activeSession?.synced && awareness ? remoteCursors(awareness, activeSession.text) : [];
    }
    return peers
      .filter((p) => p.file === active)
      .flatMap((p) => (p.cursor ? [{ id: p.id, name: p.name.split(" ")[0], color: p.color, ...p.cursor }] : []));
    // cursorTick re-runs this when collaborators move or type.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, peers, live, activeSession, activeSession?.synced, cursorTick]);

  // Members with live presence: online ones show the file they have open.
  const livePeers = useMemo<WorkspacePeer[]>(() => {
    if (!live) return peers;
    const online = new Map<string, string | null>();
    for (const p of collab.peers) {
      if (p.user.id === collabMe.id) continue; // my other tabs
      if (!online.has(p.user.id) || p.file) online.set(p.user.id, p.file);
    }
    return peers.map((p) =>
      online.has(p.id)
        ? { ...p, status: "online" as const, file: online.get(p.id) ?? null, activity: online.get(p.id) ? "Viewing" : "Online" }
        : p,
    );
  }, [live, peers, collab.peers, collabMe.id]);
  const peersHere = livePeers.filter((p) => p.file === active);
  const activeSynced = !!activeSession?.synced;
  const editorCollab = useMemo(
    () => (activeSession && activeSynced ? { text: activeSession.text, awareness: activeSession.provider.awareness } : null),
    [activeSession, activeSynced],
  );

  // ----- Actions -----------------------------------------------------------

  function openFile(path: string, line?: number) {
    setTabs((t) => (t.includes(path) ? t : [...t, path]));
    setActive(path);
    setReveal(line ? { line, nonce: Date.now() } : null);
    if (!isDesktop) setMobileExplorer(false);
  }

  function selectTab(path: string | null) {
    setActive(path);
    setReveal(null);
  }

  function closeTab(path: string) {
    const idx = tabs.indexOf(path);
    const next = tabs.filter((p) => p !== path);
    setTabs(next);
    if (path === active) selectTab(next[idx] ?? next[idx - 1] ?? null);
  }

  function toggleFolder(path: string) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }

  async function createFile(path: string): Promise<string | null> {
    if (files[path] !== undefined) return "A file with that path already exists.";
    if (paths.some((p) => p.startsWith(`${path}/`))) return "A folder with that name already exists.";
    if (paths.some((p) => path.startsWith(`${p}/`))) return "A file with that name is in the way.";
    if (persistence) {
      if (!canWrite) return "You have view-only access to this project.";
      const result = await createFileAction({ projectId: persistence.projectId, path });
      if (!result.ok) return result.error;
      setVersions((v) => ({ ...v, [path]: result.version }));
      setFileIds((ids) => ({ ...ids, [path]: result.id }));
    }
    setFiles((f) => ({ ...f, [path]: "" }));
    setSavedHash((h) => ({ ...h, [path]: hashText("") }));
    setExpanded((s) => new Set([...s, ...allFolders([path])]));
    openFile(path);
    return null;
  }

  const fileName = (path: string) => path.split("/").pop() ?? path;

  /**
   * Saves one file. Only the content captured when the save starts is marked
   * as saved, so edits made while the request is in flight stay dirty. A
   * failed or conflicting save never clears the unsaved indicator.
   */
  async function saveFile(path: string, { overwrite = false }: { overwrite?: boolean } = {}) {
    // With live editing, save exactly what's in the shared document.
    const session = liveSessionFor(path);
    if (isLivePath(path) && (!session?.synced || collab.status !== "connected")) {
      toast({
        tone: "warning",
        title: `Can't save ${fileName(path)} yet`,
        description: "The live session isn't connected. Your edits are kept — save again once it reconnects.",
      });
      return;
    }
    const content = session ? session.text.toString() : files[path];
    if (content === undefined) return;
    const markerVersion = session?.saved.get("version");

    if (!persistence) {
      setSavedHash((h) => ({ ...h, [path]: hashText(content) }));
      toast({
        title: `Saved ${fileName(path)}`,
        description: "Demo workspace — saved in this tab only. Reloading resets it.",
      });
      return;
    }
    if (!canWrite) {
      toast({ tone: "info", title: "View-only access", description: "You can read this project but not save changes." });
      return;
    }
    if (savingRef.current.has(path)) return; // one save per file at a time
    savingRef.current.add(path);
    setSaving(new Set(savingRef.current));
    try {
      const result = await saveFileAction({
        projectId: persistence.projectId,
        path,
        content,
        baseVersion: typeof markerVersion === "number" ? markerVersion : (versions[path] ?? 1),
        overwrite,
      });
      if (result.ok) {
        // Tell every collaborator what was saved (clears their unsaved dot too).
        session?.doc.transact(() => {
          session.saved.set("version", result.version);
          session.saved.set("hash", hashText(content));
        });
        setSavedHash((h) => ({ ...h, [path]: hashText(content) }));
        setVersions((v) => ({ ...v, [path]: result.version }));
        setConflicts((c) => without(c, path));
        toast({ title: `Saved ${fileName(path)}` });
      } else if (result.reason === "conflict") {
        setConflicts((c) => ({ ...c, [path]: { currentVersion: result.currentVersion } }));
        toast({ tone: "warning", title: `${fileName(path)} wasn't saved`, description: result.error });
      } else {
        toast({ tone: "warning", title: `Couldn't save ${fileName(path)}`, description: result.error });
      }
    } catch {
      toast({
        tone: "warning",
        title: `Couldn't save ${fileName(path)}`,
        description: "The server couldn't be reached. Your changes are still here — try ⌘S again.",
      });
    } finally {
      savingRef.current.delete(path);
      setSaving(new Set(savingRef.current));
    }
  }

  function saveActive() {
    if (!active) return;
    if (!dirty.has(active) && !conflicts[active]) {
      toast({ tone: "info", title: "No changes to save" });
      return;
    }
    void saveFile(active);
  }

  /** Conflict resolution: replace local edits with the latest saved version. */
  async function loadSavedVersion(path: string) {
    if (!persistence) return;
    const result = await readFileAction({ projectId: persistence.projectId, path }).catch(() => null);
    if (!result || !result.ok) {
      toast({ tone: "warning", title: "Couldn't load the saved version", description: result?.error ?? "Try again." });
      return;
    }
    const session = liveSessionFor(path);
    if (session?.synced) {
      // Replace the shared text for everyone in this file.
      session.doc.transact(() => {
        session.text.delete(0, session.text.length);
        session.text.insert(0, result.content);
        session.saved.set("version", result.version);
        session.saved.set("hash", hashText(result.content));
      });
    }
    setFiles((f) => ({ ...f, [path]: result.content }));
    setSavedHash((h) => ({ ...h, [path]: hashText(result.content) }));
    setVersions((v) => ({ ...v, [path]: result.version }));
    setConflicts((c) => without(c, path));
    toast({ tone: "info", title: `Loaded the saved ${fileName(path)}`, description: "Your unsaved edits were discarded." });
  }

  // Warn before leaving with changes that could be lost. With live editing,
  // unsaved shared edits are kept by the collab server; only edits that
  // haven't reached it yet are at risk.
  const hasUnsaved = live
    ? collab.hasUnsyncedChanges() || (collab.status !== "connected" && dirty.size > 0)
    : !isDemo && dirty.size > 0;
  useEffect(() => {
    if (!hasUnsaved) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [hasUnsaved]);

  function toggleExplorer() {
    if (isDesktop) setExplorerOpen((v) => !v);
    else {
      setMobileCollab(false);
      setMobileExplorer((v) => !v);
    }
  }

  function toggleCollab() {
    if (isDesktop) setCollabPref(!collabOpen);
    else {
      setMobileExplorer(false);
      setMobileCollab((v) => !v);
    }
  }

  function nextId() {
    lineId.current += 1;
    return lineId.current;
  }

  function appendOutput(lines: Omit<OutputLine, "id">[]) {
    setOutput((o) => [...o, ...lines.map((l) => ({ ...l, id: nextId() }))]);
  }

  function run() {
    if (runState !== "idle") return;
    setBottomOpen(true);
    setBottomTab("output");
    setRunState("starting");
    const hasError = problems.some((p) => p.severity === "error");
    const errorAt = problems.find((p) => p.severity === "error");
    const steps: [number, Omit<OutputLine, "id">[], (() => void)?][] = !isDemo
      ? [
          [0, [{ text: "$ run", tone: "accent" }]],
          [300, [{ text: "  Simulated run — code execution isn't available yet, nothing was executed.", tone: "muted" }]],
          [900, [{ text: `  ✓ ${workspace.name}: ${paths.length} files checked`, tone: "success" }], () => setRunState("running")],
        ]
      : [
      [0, [{ text: "$ npm run dev", tone: "accent" }]],
      [180, [{ text: "> orbit-dashboard@0.4.2 dev", tone: "muted" }, { text: "> next dev", tone: "muted" }, { text: "" }]],
      [520, [{ text: "  ▲ Next.js 16.4.2 — simulated run, no code is executed" }]],
      [780, [{ text: "  - Local:   http://localhost:3000 (simulated — nothing is served)", tone: "muted" }]],
      [1150, [{ text: "  ✓ Starting...", tone: "success" }]],
      [1650, [{ text: "  ✓ Ready in 812ms", tone: "success" }], () => setRunState("running")],
      [2200, [{ text: "  ○ Compiling / ...", tone: "muted" }]],
      [
        2900,
        hasError && errorAt
          ? [
              { text: `  ⨯ ./${errorAt.file}:${errorAt.line}:${errorAt.col}`, tone: "error" },
              { text: `  Type error: ${errorAt.message}`, tone: "error" },
              { text: "  1 error found — see the Problems tab for an explanation.", tone: "warning" },
            ]
          : [
              { text: "  ✓ Compiled / in 1.2s", tone: "success" },
              { text: "  GET / 200 in 64ms", tone: "muted" },
            ],
      ],
    ];
    // Mutate in place so the unmount cleanup sees every pending timer.
    timers.current.push(
      ...steps.map(([delay, lines, after]) =>
        window.setTimeout(() => {
          appendOutput(lines);
          after?.();
        }, delay),
      ),
    );
  }

  function stop() {
    timers.current.forEach((t) => window.clearTimeout(t));
    timers.current.length = 0;
    appendOutput([{ text: "■ Process stopped", tone: "muted" }, { text: "" }]);
    setRunState("idle");
  }

  async function copyLink(): Promise<boolean> {
    const url = `${window.location.origin}/workspace/${workspace.id}`;
    try {
      await navigator.clipboard.writeText(url);
      toast({
        title: "Link copied",
        description: isDemo ? "Anyone opening it sees the same demo data." : "Only members of this project can open it.",
      });
      return true;
    } catch {
      toast({ tone: "warning", title: "Couldn't copy the link", description: url });
      return false;
    }
  }

  function runCommand(raw: string) {
    const input: TerminalLine = { id: nextId(), kind: "input", text: raw };
    const out = (text: string): TerminalLine => ({ id: nextId(), kind: "output", text });
    const [cmd, ...args] = raw.split(/\s+/);
    if (!raw) return setTerminal((t) => [...t, input]);
    if (cmd === "clear") return setTerminal([]);

    let response: TerminalLine[] = [];
    const topLevel = [...new Set(paths.map((p) => p.split("/")[0]))].sort();
    switch (cmd) {
      case "help":
        response = [
          out(
            [
              "Available (simulated) commands:",
              "  ls [dir]        list files",
              "  cat <file>      print a file",
              "  pwd · whoami · date · echo",
              "  git status      show unsaved files",
              "  npm run dev     start a simulated run (same as Run)",
              "  clear           clear the terminal",
            ].join("\n"),
          ),
        ];
        break;
      case "ls": {
        const dir = args[0]?.replace(/\/$/, "");
        if (!dir) {
          response = [out(topLevel.join("  "))];
        } else {
          const children = [
            ...new Set(
              paths
                .filter((p) => p.startsWith(`${dir}/`))
                .map((p) => p.slice(dir.length + 1).split("/")[0]),
            ),
          ].sort();
          response = [out(children.length ? children.join("  ") : `ls: ${dir}: No such file or directory`)];
        }
        break;
      }
      case "cat":
        response = [
          out(
            !args[0]
              ? "usage: cat <file>"
              : files[args[0]] !== undefined
                ? files[args[0]] || "(empty file)"
                : `cat: ${args[0]}: No such file`,
          ),
        ];
        break;
      case "pwd":
        response = [out(`/workspace/${workspace.name}`)];
        break;
      case "whoami":
        response = [out(me.handle)];
        break;
      case "date":
        response = [out(new Date().toString())];
        break;
      case "echo":
        response = [out(args.join(" "))];
        break;
      case "git":
        if (args[0] === "status") {
          response = [
            out(
              dirty.size
                ? `On branch ${workspace.branch}\nChanges not staged for commit:\n${[...dirty]
                    .map((p) => `\tmodified:   ${p}`)
                    .join("\n")}`
                : `On branch ${workspace.branch}\nnothing to commit, working tree clean`,
            ),
          ];
        } else {
          response = [out(`git ${args.join(" ")}: not available in the simulated terminal`)];
        }
        break;
      case "npm":
        if (args[0] === "run" && args[1] === "dev") {
          response = [out("Starting simulated run… see the Output tab.")];
          setTerminal((t) => [...t, input, ...response]);
          run();
          return;
        }
        response = [out("npm: package scripts aren't executed yet. Try `npm run dev` for a simulated run.")];
        break;
      default:
        response = [out(`command not found: ${cmd}`)];
    }
    setTerminal((t) => [...t, input, ...response]);
  }

  function getFix(problem: Problem): DiagnosticFix | null {
    if (!isDemo || problem.file !== METRIC_CARD) return null;
    const replace = (from: string, to: string) => () => {
      setFiles((f) => ({ ...f, [METRIC_CARD]: f[METRIC_CARD].replace(from, to) }));
      openFile(METRIC_CARD, problem.line);
      toast({ title: "Applied suggested fix", description: "Review the change, then save with ⌘S." });
    };
    if (problem.code === "ts(2345)") {
      return {
        explanation:
          "`delta` is declared optional (`delta?: number`), so inside the component its type is `number | undefined`. `formatDelta` only accepts a `number`. Provide a fallback such as `delta ?? 0`, or widen `formatDelta` to handle `undefined`.",
        label: "Apply fix: delta ?? 0",
        apply: replace(ERROR_SNIPPET, "formatDelta(delta ?? 0)"),
      };
    }
    return {
      explanation:
        "`delta && …` short-circuits when `delta` is 0, so `trend` becomes \"down\" for a flat metric. Check for `undefined` explicitly instead of relying on truthiness.",
      label: "Apply fix: delta !== undefined",
      apply: replace(WARNING_SNIPPET, "delta !== undefined && delta >= 0"),
    };
  }

  function follow(peer: WorkspacePeer) {
    if (!peer.file) return;
    openFile(peer.file, peer.cursor?.line);
    if (!isDesktop) setMobileCollab(false);
  }

  // ----- Keyboard shortcuts --------------------------------------------------

  /** Shared by the window shortcut handler and Monaco's own keybindings. */
  function runEditorCommand(command: EditorCommand) {
    switch (command) {
      case "explorer":
        toggleExplorer();
        break;
      case "panel":
        setBottomOpen((v) => !v);
        break;
      case "collab":
        toggleCollab();
        break;
      case "run":
        if (runState === "idle") run();
        else stop();
        break;
      case "save":
        saveActive();
        break;
    }
  }

  const onShortcut = useEffectEvent((e: KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    const key = e.key.toLowerCase();
    const command: EditorCommand | null =
      key === "b" && !e.shiftKey
        ? "explorer"
        : key === "j" && !e.shiftKey
          ? "panel"
          : key === "k" && e.shiftKey
            ? "collab"
            : key === "enter"
              ? "run"
              : key === "s"
                ? "save"
                : null;
    if (!command) return;
    // Always stop the browser default (e.g. the "Save page" dialog for ⌘S).
    e.preventDefault();
    runEditorCommand(command);
  });

  useEffect(() => {
    const handler = (e: KeyboardEvent) => onShortcut(e);
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ----- Render ------------------------------------------------------------------

  const explorer = (
    <FileExplorer
      workspaceName={workspace.name}
      paths={paths}
      activePath={active}
      dirty={dirty}
      expanded={expanded}
      onToggleFolder={toggleFolder}
      onCollapseAll={() => setExpanded(new Set())}
      onOpenFile={openFile}
      onCreateFile={createFile}
      peers={livePeers}
      readOnly={!canWrite}
    />
  );

  const collaboration = (
    <CollaborationPanel
      me={me}
      livePresence={live}
      peers={livePeers}
      call={call}
      onCallChange={(next) => setCall((c) => ({ ...c, ...next }))}
      callSlot={persistence ? setCallSlot : undefined}
      onInvite={() => setInviteOpen(true)}
      onFollow={follow}
      onClose={isDesktop ? undefined : () => setMobileCollab(false)}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-sunken">
      {persistence && (
        <LiveCall
          projectId={persistence.projectId}
          me={{ name: me.name }}
          configured={persistence.callsConfigured}
          canPublish={me.role !== "Viewer"}
          slot={callSlot}
          onStateChange={setLiveCall}
        />
      )}
      <Toolbar
        name={workspace.name}
        badge={isDemo ? "Sample" : !canWrite ? "View only" : undefined}
        branch={workspace.branch}
        peers={livePeers}
        explorerOpen={explorerVisible}
        bottomOpen={bottomOpen}
        collabOpen={collabVisible}
        onToggleExplorer={toggleExplorer}
        onToggleBottom={() => setBottomOpen((v) => !v)}
        onToggleCollab={toggleCollab}
        onInvite={() => setInviteOpen(true)}
        onCopyLink={copyLink}
        visibility={visibility}
        onVisibilityChange={(v) => {
          setVisibility(v);
          toast({
            tone: "info",
            title: "Not saved yet",
            description: isDemo
              ? "Sample workspace — sharing settings are UI only."
              : "Sharing settings arrive in a later phase. Access stays members-only.",
          });
        }}
        runState={runState}
        onRun={run}
        onStop={stop}
      />

      <div className="relative flex min-h-0 flex-1">
        {isDesktop && explorerOpen && (
          <>
            <aside aria-label="File explorer" className="shrink-0 bg-sunken" style={{ width: explorerWidth }}>
              {explorer}
            </aside>
            <ResizeHandle
              direction="x"
              label="Resize explorer"
              onResize={(d) => setExplorerWidth((w) => clamp(w + d, 180, 440))}
            />
          </>
        )}

        <div className="flex min-w-0 flex-1 flex-col">
          {tabs.length > 0 && (
            <EditorTabs tabs={tabs} active={active} dirty={dirty} onSelect={selectTab} onClose={closeTab} />
          )}

          {active && files[active] !== undefined ? (
            <>
              <div className="flex h-8 shrink-0 items-center justify-between gap-3 bg-panel px-4 text-[12px] text-fg-subtle">
                <span className="flex min-w-0 items-center gap-1 truncate">
                  {active.split("/").map((seg, i, all) => (
                    <span key={i} className="flex items-center gap-1">
                      {i > 0 && <ChevronRight className="h-3 w-3 text-fg-faint" />}
                      <span className={cn(i === all.length - 1 ? "font-medium text-fg-muted" : "text-fg-subtle")}>{seg}</span>
                    </span>
                  ))}
                </span>
                {liveOffReason ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-warning" role="status" title={liveOffReason}>
                    <TriangleAlert className="h-3 w-3" /> Live editing off — edits save normally
                  </span>
                ) : isLivePath(active) && !activeSynced ? (
                  <span className="flex shrink-0 items-center gap-1.5" role="status">
                    <LoaderCircle className="h-3 w-3 animate-spin" /> Connecting to live session…
                  </span>
                ) : saving.has(active) ? (
                  <span className="flex shrink-0 items-center gap-1.5" role="status">
                    <LoaderCircle className="h-3 w-3 animate-spin" /> Saving…
                  </span>
                ) : !canWrite ? (
                  <span className="flex shrink-0 items-center gap-1.5">
                    <Eye className="h-3 w-3" /> View only
                  </span>
                ) : null}
                {peersHere.length > 0 && (
                  <span className="flex shrink-0 items-center gap-2">
                    <AvatarStack people={peersHere} size="xs" />
                    <span className="hidden sm:inline">
                      {peersHere.map((p) => p.name.split(" ")[0]).join(", ")}{" "}
                      {peersHere.length === 1 ? "is" : "are"} here
                    </span>
                  </span>
                )}
              </div>
              {conflicts[active] && (
                <div
                  role="alert"
                  className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-y border-warning/25 bg-[#fbf2e3] px-4 py-2 text-[12.5px]"
                >
                  <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
                  <p className="min-w-0 flex-1 text-fg-muted">
                    <span className="font-medium text-fg">A newer version of {fileName(active)} was saved elsewhere.</span>{" "}
                    {live
                      ? "The shared text hasn’t been saved."
                      : "Your changes are kept here but haven’t been saved."}
                  </p>
                  <Button size="xs" variant="ghost" onClick={() => loadSavedVersion(active)}>
                    {live ? "Replace shared text with saved" : "Discard mine & load saved"}
                  </Button>
                  <Button size="xs" disabled={saving.has(active)} onClick={() => saveFile(active, { overwrite: true })}>
                    {saving.has(active) && <LoaderCircle className="h-3 w-3 animate-spin" />}
                    Overwrite with my version
                  </Button>
                </div>
              )}
              <div className="min-h-0 flex-1">
                <CodeEditor
                  readOnly={!canWrite || !liveReady}
                  collab={editorCollab}
                  path={active}
                  value={files[active]}
                  onChange={(v) => setFiles((f) => ({ ...f, [active]: v }))}
                  onCommand={runEditorCommand}
                  onCursorChange={setCursor}
                  peers={editorPeers}
                  problems={problems.filter((p) => p.file === active)}
                  reveal={reveal}
                />
              </div>
            </>
          ) : (
            <EmptyEditor
              suggestion={isDemo ? METRIC_CARD : (paths.find((p) => p.toLowerCase() === "readme.md") ?? paths[0] ?? null)}
              onOpen={openFile}
            />
          )}

          {bottomOpen && (
            <>
              <ResizeHandle
                direction="y"
                label="Resize panel"
                onResize={(d) => setBottomHeight((h) => clamp(h - d, 120, Math.round(window.innerHeight * 0.65)))}
              />
              <div className="shrink-0" style={{ height: bottomHeight }}>
                <BottomPanel
                  prompt={`~/${workspace.name} on ${workspace.branch}`}
                  tab={bottomTab}
                  onTabChange={setBottomTab}
                  onClose={() => setBottomOpen(false)}
                  terminal={terminal}
                  onTerminalCommand={runCommand}
                  onClearTerminal={() => setTerminal([])}
                  output={output}
                  onClearOutput={() => setOutput([])}
                  problems={problems}
                  onOpenProblem={(p) => openFile(p.file, p.line)}
                  getFix={getFix}
                  running={runState !== "idle"}
                />
              </div>
            </>
          )}
        </div>

        {isDesktop && collabOpen && (
          <>
            <ResizeHandle
              direction="x"
              label="Resize collaboration panel"
              onResize={(d) => setCollabWidth((w) => clamp(w - d, 260, 460))}
            />
            <aside aria-label="Collaboration" className="shrink-0 bg-sunken" style={{ width: collabWidth }}>
              {collaboration}
            </aside>
          </>
        )}

        {/* Mobile / tablet slide-over panels (kept mounted so they can animate out) */}
        {!isDesktop && (
          <>
            <button
              type="button"
              aria-label="Close panel"
              tabIndex={mobileExplorer || mobileCollab ? 0 : -1}
              className={cn(
                "absolute inset-0 z-30 bg-fg/20 transition-opacity duration-300",
                mobileExplorer || mobileCollab ? "opacity-100" : "pointer-events-none opacity-0",
              )}
              onClick={() => {
                setMobileExplorer(false);
                setMobileCollab(false);
              }}
            />
            <aside
              aria-label="File explorer"
              inert={!mobileExplorer}
              className={cn(
                "absolute inset-y-0 left-0 z-40 w-72 max-w-[85vw] bg-sunken shadow-pop transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                mobileExplorer ? "translate-x-0" : "-translate-x-[105%]",
              )}
            >
              {explorer}
            </aside>
            <aside
              aria-label="Collaboration"
              inert={!mobileCollab}
              className={cn(
                "absolute inset-y-0 right-0 z-40 w-80 max-w-[90vw] bg-sunken shadow-pop transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                mobileCollab ? "translate-x-0" : "translate-x-[105%]",
              )}
            >
              {collaboration}
            </aside>
          </>
        )}
      </div>

      <StatusBar
        persisted={!isDemo}
        live={
          collab.enabled
            ? {
                status: collab.failure ? "denied" : collab.status,
                detail: collab.failure ?? undefined,
                others: new Set(collab.peers.map((p) => p.user.id).filter((id) => id !== collabMe.id)).size,
              }
            : null
        }
        branch={workspace.branch}
        errors={errors}
        warnings={warnings}
        onShowProblems={() => {
          setBottomOpen(true);
          setBottomTab("problems");
        }}
        runState={runState}
        cursor={active ? cursor : null}
        language={activeLanguage ? languageLabel[activeLanguage] : null}
        inCall={persistence ? liveCall.joined : call.joined}
        callCount={persistence ? liveCall.participants : livePeers.filter((p) => p.inCall).length + 1}
        dirtyCount={dirty.size}
      />

      {persistence ? (
        <ProjectInviteDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          projectId={persistence.projectId}
          projectName={workspace.name}
          me={me}
          members={peers}
        />
      ) : (
        <InviteDialog
          open={inviteOpen}
          onClose={() => setInviteOpen(false)}
          name={workspace.name}
          me={me}
          linkPath={`/workspace/${workspace.id}`}
          onCopyLink={copyLink}
          peers={livePeers}
          invites={invites}
          onAddInvite={(i) => {
            setInvites((all) => [...all, i]);
            toast({ tone: "info", title: `${i.email} added`, description: "Invite recorded locally — no email was sent." });
          }}
          onRemoveInvite={(email) => setInvites((all) => all.filter((i) => i.email !== email))}
        />
      )}
    </div>
  );
}

function EmptyEditor({ suggestion, onOpen }: { suggestion: string | null; onOpen: (path: string) => void }) {
  const shortcuts = [
    { keys: ["⌘", "B"], label: "Toggle explorer" },
    { keys: ["⌘", "J"], label: "Toggle panel" },
    { keys: ["⌘", "↵"], label: "Run project" },
  ];
  return (
    <div className="flex min-h-0 flex-1 animate-fade-in items-center justify-center bg-panel p-6">
      <div className="flex max-w-xs flex-col items-center text-center">
        <LogoMark size={40} />
        <p className="mt-5 text-[15px] font-semibold text-fg">No file open</p>
        <p className="mt-1 text-[13px] text-fg-subtle">Pick a file from the explorer to start editing.</p>
        {suggestion && (
          <button
            type="button"
            onClick={() => onOpen(suggestion)}
            className="mt-4 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-accent hover:text-accent-strong"
          >
            <FileCode2 className="h-3.5 w-3.5" /> Open {suggestion.split("/").pop()}
          </button>
        )}
        <ul className="mt-8 w-full divide-y divide-line border-y border-line text-[12.5px] text-fg-subtle">
          {shortcuts.map((s) => (
            <li key={s.label} className="flex items-center justify-between py-2">
              {s.label}
              <span className="flex gap-1">
                {s.keys.map((k) => (
                  <Kbd key={k}>{k}</Kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <p className="mt-6 flex items-center gap-1.5 text-[11px] text-fg-subtle">
          <Keyboard className="h-3 w-3" /> Ctrl instead of ⌘ on Windows / Linux
        </p>
      </div>
    </div>
  );
}
