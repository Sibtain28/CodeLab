"use client";

import { RotateCw, TriangleAlert } from "lucide-react";
import dynamic from "next/dynamic";
import { Component, useMemo, useState, type ErrorInfo, type ReactNode } from "react";
import { TokenLine } from "@/components/code/highlighted-lines";
import { Button } from "@/components/ui/button";
import { languageFromPath, tokenize } from "@/lib/highlight";
import { EditorSkeleton } from "./editor-skeleton";
import type { MonacoCodeEditorProps } from "./monaco-editor";

export type { EditorCommand, EditorPeerCursor } from "./monaco-editor";

/**
 * Monaco is client-only (it needs window, workers and the DOM) and heavy, so
 * it is code-split and only fetched when a workspace opens.
 */
const MonacoCodeEditor = dynamic(() => import("./monaco-editor"), {
  ssr: false,
  loading: () => <EditorSkeleton />,
});

/** Catches failures loading or running Monaco and shows a read-only fallback. */
class EditorErrorBoundary extends Component<
  { fallback: (error: Error, retry: () => void) => ReactNode; children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Code editor failed:", error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return this.props.fallback(this.state.error, () => this.setState({ error: null }));
    }
    return this.props.children;
  }
}

function ReadOnlyFallback({
  path,
  value,
  error,
  onRetry,
}: {
  path: string;
  value: string;
  error: Error;
  onRetry: () => void;
}) {
  const lines = useMemo(() => tokenize(value, languageFromPath(path)), [value, path]);
  return (
    <div className="flex h-full flex-col bg-panel">
      <div role="alert" className="flex flex-wrap items-center gap-3 border-b border-line bg-[#fbf2e3] px-4 py-2.5 text-[12.5px]">
        <TriangleAlert className="h-4 w-4 shrink-0 text-warning" />
        <p className="min-w-0 flex-1 text-fg-muted">
          <span className="font-medium text-fg">The editor couldn&apos;t load.</span> Showing this file
          read-only. Your unsaved changes are kept.
          <span className="ml-2 font-mono text-[11.5px] text-fg-subtle">{error.message}</span>
        </p>
        <Button size="xs" onClick={onRetry}>
          <RotateCw className="h-3 w-3" /> Try again
        </Button>
        <Button size="xs" variant="ghost" onClick={() => window.location.reload()}>
          Reload page
        </Button>
      </div>
      <pre className="min-h-0 flex-1 overflow-auto py-3 font-mono text-[13px] leading-[22px]">
        {lines.map((tokens, i) => (
          <div key={i} className="flex whitespace-pre">
            <span className="w-[52px] shrink-0 select-none pr-4 text-right text-fg-faint">{i + 1}</span>
            <span className="pl-3">
              <TokenLine tokens={tokens} />
            </span>
          </div>
        ))}
      </pre>
    </div>
  );
}

export function CodeEditor(props: MonacoCodeEditorProps) {
  // Bumping the key remounts the editor subtree after a retry.
  const [attempt, setAttempt] = useState(0);
  return (
    <EditorErrorBoundary
      key={attempt}
      fallback={(error, reset) => (
        <ReadOnlyFallback
          path={props.path}
          value={props.value}
          error={error}
          onRetry={() => {
            reset();
            setAttempt((a) => a + 1);
          }}
        />
      )}
    >
      <MonacoCodeEditor {...props} />
    </EditorErrorBoundary>
  );
}
