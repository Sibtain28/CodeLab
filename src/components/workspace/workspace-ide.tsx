"use client";

import { ChevronRight, FileCode2, Keyboard } from "lucide-react";
import {
  useEffect,
  useEffectEvent,
  useMemo,
  useRef,
  useState,
} from "react";
import { LogoMark } from "@/components/brand/logo";
import { AvatarStack } from "@/components/ui/avatar";
import { Kbd } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { languageFromPath, languageLabel } from "@/lib/highlight";
import {
  initialFiles,
  initialOpenTabs,
  peers,
  type Problem,
  type WorkspaceMeta,
  type WorkspacePeer,
} from "@/lib/mock/workspace";
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

const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

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

export function WorkspaceIDE({ workspace }: { workspace: WorkspaceMeta }) {
  const toast = useToast();
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  // Between 1024px and 1280px three columns leave the editor too narrow, so the
  // collaboration panel starts closed there until the user opens it.
  const isWide = useMediaQuery("(min-width: 1280px)");

  // Files (in-memory only)
  const [files, setFiles] = useState<Record<string, string>>(initialFiles);
  const [saved, setSaved] = useState<Record<string, string>>(initialFiles);
  const [tabs, setTabs] = useState<string[]>(initialOpenTabs);
  const [active, setActive] = useState<string | null>(initialOpenTabs[0]);
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
  const dirty = useMemo(() => new Set(paths.filter((p) => files[p] !== saved[p])), [paths, files, saved]);
  const problems = useMemo(() => computeProblems(files), [files]);
  const errors = problems.filter((p) => p.severity === "error").length;
  const warnings = problems.length - errors;

  const explorerVisible = isDesktop ? explorerOpen : mobileExplorer;
  const collabVisible = isDesktop ? collabOpen : mobileCollab;

  const activeLanguage = active ? languageFromPath(active) : null;
  const peersHere = peers.filter((p) => p.file === active);
  const editorPeers = useMemo<EditorPeerCursor[]>(
    () =>
      peers
        .filter((p) => p.file === active)
        .flatMap((p) => (p.cursor ? [{ id: p.id, name: p.name.split(" ")[0], color: p.color, ...p.cursor }] : [])),
    [active],
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

  function createFile(path: string): string | null {
    if (files[path] !== undefined) return "A file with that path already exists.";
    if (paths.some((p) => p.startsWith(`${path}/`))) return "A folder with that name already exists.";
    setFiles((f) => ({ ...f, [path]: "" }));
    setExpanded((s) => new Set([...s, ...allFolders([path])]));
    openFile(path);
    return null;
  }

  function saveActive() {
    if (!active) return;
    if (!dirty.has(active)) {
      toast({ tone: "info", title: "No changes to save" });
      return;
    }
    setSaved((s) => ({ ...s, [active]: files[active] }));
    toast({
      title: `Saved ${active.split("/").pop()}`,
      description: "Saved to this browser session only — reloading resets the demo.",
    });
  }

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
    const steps: [number, Omit<OutputLine, "id">[], (() => void)?][] = [
      [0, [{ text: "$ npm run dev", tone: "accent" }]],
      [180, [{ text: "> orbit-dashboard@0.4.2 dev", tone: "muted" }, { text: "> next dev", tone: "muted" }, { text: "" }]],
      [520, [{ text: "  ▲ Next.js 16.4.2 — simulated run, no code is executed" }]],
      [780, [{ text: "  - Local:   http://localhost:3000 (not served in Phase 1)", tone: "muted" }]],
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
      toast({ title: "Link copied", description: "Anyone opening it sees the same demo data." });
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
        response = [out("darain")];
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
        response = [out("npm: package scripts aren't executed in Phase 1. Try `npm run dev` for a simulated run.")];
        break;
      default:
        response = [out(`command not found: ${cmd}`)];
    }
    setTerminal((t) => [...t, input, ...response]);
  }

  function getFix(problem: Problem): DiagnosticFix | null {
    if (problem.file !== METRIC_CARD) return null;
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
      peers={peers}
    />
  );

  const collaboration = (
    <CollaborationPanel
      peers={peers}
      call={call}
      onCallChange={(next) => setCall((c) => ({ ...c, ...next }))}
      onInvite={() => setInviteOpen(true)}
      onFollow={follow}
      onClose={isDesktop ? undefined : () => setMobileCollab(false)}
    />
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-sunken">
      <Toolbar
        name={workspace.name}
        branch={workspace.branch}
        peers={peers}
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
          toast({ tone: "info", title: "Access updated (UI only)", description: "Permissions are enforced once auth lands." });
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
              <div className="min-h-0 flex-1">
                <CodeEditor
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
            <EmptyEditor onOpen={() => openFile("src/components/MetricCard.tsx")} />
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
        inCall={call.joined}
        callCount={peers.filter((p) => p.inCall).length + 1}
        dirtyCount={dirty.size}
      />

      <InviteDialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        linkPath={`/workspace/${workspace.id}`}
        onCopyLink={copyLink}
        peers={peers}
        invites={invites}
        onAddInvite={(i) => {
          setInvites((all) => [...all, i]);
          toast({ tone: "info", title: `${i.email} added`, description: "Invite recorded locally — no email was sent." });
        }}
        onRemoveInvite={(email) => setInvites((all) => all.filter((i) => i.email !== email))}
      />
    </div>
  );
}

function EmptyEditor({ onOpen }: { onOpen: () => void }) {
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
        <button
          type="button"
          onClick={onOpen}
          className="mt-4 inline-flex items-center gap-1.5 rounded-md text-[13px] font-medium text-accent hover:text-accent-strong"
        >
          <FileCode2 className="h-3.5 w-3.5" /> Open MetricCard.tsx
        </button>
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
