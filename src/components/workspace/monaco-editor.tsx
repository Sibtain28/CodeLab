"use client";

/**
 * Monaco-backed code editor (client-only — see code-editor.tsx).
 *
 * A thin React wrapper around `monaco.editor.create`. We don't use
 * @monaco-editor/react: with Cache Components, Next.js keeps visited routes
 * mounted but hidden (React <Activity>), which runs effect cleanups and then
 * re-runs effects on return. That wrapper disposes its editor on cleanup but
 * never recreates it, leaving a dead editor. Creating and disposing the
 * editor in one effect handles hide/show (and normal unmounts) correctly.
 *
 * One Monaco model per file path: switching tabs swaps models, so every file
 * keeps its own content, undo history, cursor and scroll position.
 */
import { useEffect, useLayoutEffect, useRef } from "react";
import type { editor as MonacoEditorNS } from "monaco-editor";
import { monaco, THEME } from "@/lib/monaco/setup";
import { monacoLanguage } from "@/lib/highlight";
import type { PeerColor } from "@/lib/mock/people";
import type { Problem } from "@/lib/mock/workspace";

export type EditorCommand = "save" | "run" | "explorer" | "panel" | "collab";

export interface EditorPeerCursor {
  id: string;
  name: string;
  color: PeerColor;
  line: number;
  col: number;
}

export interface MonacoCodeEditorProps {
  path: string;
  value: string;
  onChange: (value: string) => void;
  onCursorChange: (pos: { line: number; col: number }) => void;
  onCommand: (command: EditorCommand) => void;
  peers: EditorPeerCursor[];
  problems: Problem[];
  /** When `nonce` changes, scroll the given line into view. */
  reveal?: { line: number; nonce: number } | null;
  /** View-only access: the buffer can be read and selected but not edited. */
  readOnly?: boolean;
}

/** Model URIs need a scheme; the file extension drives TSX parsing. */
const uriFor = (path: string) => monaco.Uri.parse(`file:///${path}`);

/** Owner id for the sample diagnostics placed on models. */
const MARKER_OWNER = "codelab-mock";

function readMonoFont() {
  const v = getComputedStyle(document.documentElement).getPropertyValue("--font-geist-mono").trim();
  return `${v ? `${v}, ` : ""}ui-monospace, SFMono-Regular, Menlo, monospace`;
}

function getOrCreateModel(path: string, value: string) {
  const uri = uriFor(path);
  return monaco.editor.getModel(uri) ?? monaco.editor.createModel(value, monacoLanguage(path), uri);
}

const OPTIONS: MonacoEditorNS.IStandaloneEditorConstructionOptions = {
  theme: THEME,
  fontSize: 13,
  lineHeight: 22,
  fontLigatures: false,
  tabSize: 2,
  insertSpaces: true,
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  smoothScrolling: true,
  cursorBlinking: "smooth",
  cursorSmoothCaretAnimation: "on",
  renderLineHighlight: "line",
  padding: { top: 12, bottom: 12 },
  lineNumbersMinChars: 3,
  lineDecorationsWidth: 12,
  glyphMargin: false,
  folding: true,
  showFoldingControls: "mouseover",
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: { verticalScrollbarSize: 10, horizontalScrollbarSize: 10, useShadows: false },
  guides: { indentation: true, bracketPairs: false },
  bracketPairColorization: { enabled: false },
  fixedOverflowWidgets: true,
  automaticLayout: true,
  stickyScroll: { enabled: false },
  ariaLabel: "Code editor",
};

export default function MonacoCodeEditor({
  path,
  value,
  onChange,
  onCursorChange,
  onCommand,
  peers,
  problems,
  reveal,
  readOnly = false,
}: MonacoCodeEditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<MonacoEditorNS.IStandaloneCodeEditor | null>(null);
  const viewStates = useRef(new Map<string, MonacoEditorNS.ICodeEditorViewState | null>());
  const currentPath = useRef<string | null>(null);
  /** True while we push external content into a model (not user typing). */
  const applyingExternal = useRef(false);

  // Latest props for Monaco callbacks, without re-creating the editor.
  const latest = useRef({ onChange, onCursorChange, onCommand, path, value });
  useLayoutEffect(() => {
    latest.current = { onChange, onCursorChange, onCommand, path, value };
  });

  // Create the editor (and dispose it on unmount or when the route is hidden).
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const { path: initialPath, value: initialValue } = latest.current;
    const savedViews = viewStates.current;

    const editor = monaco.editor.create(container, {
      ...OPTIONS,
      fontFamily: readMonoFont(),
      model: getOrCreateModel(initialPath, initialValue),
    });
    editorRef.current = editor;
    currentPath.current = initialPath;
    editor.restoreViewState(savedViews.get(initialPath) ?? null);

    // Re-measure once the self-hosted mono font has loaded.
    document.fonts?.ready.then(() => monaco.editor.remeasureFonts());

    // App shortcuts must work inside the editor. Some collide with Monaco
    // defaults (⌘⇧K delete line, ⌘↵ insert line below), so they are bound
    // here; Monaco then stops propagation, so the window handler won't also fire.
    const { KeyMod, KeyCode } = monaco;
    const bind = (keys: number, command: EditorCommand) =>
      editor.addCommand(keys, () => latest.current.onCommand(command));
    bind(KeyMod.CtrlCmd | KeyCode.KeyS, "save");
    bind(KeyMod.CtrlCmd | KeyCode.Enter, "run");
    bind(KeyMod.CtrlCmd | KeyCode.KeyB, "explorer");
    bind(KeyMod.CtrlCmd | KeyCode.KeyJ, "panel");
    bind(KeyMod.CtrlCmd | KeyMod.Shift | KeyCode.KeyK, "collab");

    const subs = [
      editor.onDidChangeModelContent(() => {
        if (applyingExternal.current) return;
        latest.current.onChange(editor.getValue());
      }),
      editor.onDidChangeCursorPosition((e) =>
        latest.current.onCursorChange({ line: e.position.lineNumber, col: e.position.column }),
      ),
    ];

    return () => {
      if (currentPath.current) savedViews.set(currentPath.current, editor.saveViewState());
      subs.forEach((s) => s.dispose());
      editor.dispose();
      editorRef.current = null;
      currentPath.current = null;
      // Models are rebuilt from React state next time, so buffers can never
      // drift from the in-memory files.
      monaco.editor.getModels().forEach((m) => {
        if (m.uri.scheme === "file") m.dispose();
      });
    };
  }, []);

  // Switch models when the active file changes, keeping per-file view state.
  useLayoutEffect(() => {
    const editor = editorRef.current;
    if (!editor || currentPath.current === path) return;
    if (currentPath.current) viewStates.current.set(currentPath.current, editor.saveViewState());
    editor.setModel(getOrCreateModel(path, latest.current.value));
    editor.restoreViewState(viewStates.current.get(path) ?? null);
    currentPath.current = path;
  }, [path]);

  // Content sync. The editor is uncontrolled while typing: React state follows
  // Monaco's change events. Only *external* changes (e.g. an applied fix) are
  // pushed into the model. As a layout effect this runs in the same task as
  // the render, so a keystroke can't land between the state update and this
  // comparison — typing is never overwritten by a stale value.
  useLayoutEffect(() => {
    const model = monaco.editor.getModel(uriFor(path));
    if (!model || model.getValue() === value) return;
    applyingExternal.current = true;
    model.pushEditOperations([], [{ range: model.getFullModelRange(), text: value }], () => null);
    model.pushStackElement();
    applyingExternal.current = false;
  }, [path, value]);

  // Sample diagnostics → Monaco markers on the active model.
  useEffect(() => {
    const model = editorRef.current?.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(
      model,
      MARKER_OWNER,
      problems.map((p) => {
        const text = model.getLineContent(Math.min(p.line, model.getLineCount()));
        const word = /^[\w$.]+/.exec(text.slice(p.col - 1))?.[0] ?? "";
        return {
          severity: p.severity === "error" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
          message: p.message,
          code: p.code,
          source: "CodeLab (sample diagnostics)",
          startLineNumber: p.line,
          startColumn: p.col,
          endLineNumber: p.line,
          endColumn: p.col + Math.max(word.length, 1),
        };
      }),
    );
  }, [problems, path, value]);

  // Collaborator presence (sample positions): line tint + caret with name.
  useEffect(() => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;

    const lineCount = model.getLineCount();
    const visible = peers.filter((p) => p.line <= lineCount);
    const decorations = editor.createDecorationsCollection(
      visible.map((p) => ({
        range: new monaco.Range(p.line, 1, p.line, 1),
        options: { isWholeLine: true, className: `cl-peer-line cl-peer-${p.color}` },
      })),
    );
    const widgets = visible.map((p) => {
      const node = document.createElement("div");
      node.className = `cl-peer-caret cl-peer-${p.color}`;
      node.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "cl-peer-label";
      label.textContent = p.name;
      node.appendChild(label);
      const widget: MonacoEditorNS.IContentWidget = {
        getId: () => `cl-peer-${p.id}`,
        getDomNode: () => node,
        getPosition: () => ({
          position: { lineNumber: p.line, column: Math.min(p.col + 1, model.getLineMaxColumn(p.line)) },
          preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
        }),
      };
      editor.addContentWidget(widget);
      return widget;
    });
    return () => {
      // The editor may already be disposed (route hidden or unmounting).
      if (editorRef.current !== editor) return;
      decorations.clear();
      widgets.forEach((w) => editor.removeContentWidget(w));
    };
  }, [peers, path]);

  useEffect(() => {
    editorRef.current?.updateOptions({ readOnly });
  }, [readOnly]);

  // Jump to a line (problem click, "follow" a teammate).
  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || !reveal) return;
    editor.revealLineInCenter(reveal.line, monaco.editor.ScrollType.Smooth);
    editor.setPosition({ lineNumber: reveal.line, column: 1 });
    editor.focus();
  }, [reveal]);

  return <div ref={containerRef} className="cl-monaco h-full w-full" />;
}
