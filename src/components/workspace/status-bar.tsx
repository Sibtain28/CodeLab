"use client";

import { CircleX, GitBranch, Radio, TriangleAlert, Video } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RunState } from "./toolbar";

export function StatusBar({
  branch,
  errors,
  warnings,
  onShowProblems,
  runState,
  cursor,
  language,
  inCall,
  callCount,
  dirtyCount,
}: {
  branch: string;
  errors: number;
  warnings: number;
  onShowProblems: () => void;
  runState: RunState;
  cursor: { line: number; col: number } | null;
  language: string | null;
  inCall: boolean;
  callCount: number;
  dirtyCount: number;
}) {
  return (
    <footer className="flex h-[26px] shrink-0 items-center gap-1 border-t border-line bg-sunken px-1.5 text-[11.5px] text-fg-subtle">
      <span className="flex items-center gap-1.5 px-1.5">
        <GitBranch className="h-3 w-3" />
        <span className="font-mono text-[11px]">
          {branch}
          {dirtyCount > 0 && <span className="text-fg-faint">*</span>}
        </span>
      </span>
      <button
        type="button"
        onClick={onShowProblems}
        className="flex h-[22px] items-center gap-2.5 rounded px-1.5 transition-colors duration-150 hover:bg-hover hover:text-fg"
        aria-label={`${errors} errors, ${warnings} warnings — show problems`}
      >
        <span className="flex items-center gap-1 tabular-nums">
          <CircleX className={cn("h-3 w-3", errors && "text-danger")} /> {errors}
        </span>
        <span className="flex items-center gap-1 tabular-nums">
          <TriangleAlert className={cn("h-3 w-3", warnings && "text-warning")} /> {warnings}
        </span>
      </button>
      <span className={cn("hidden items-center gap-1.5 px-1.5 sm:flex", runState !== "idle" && "text-accent")}>
        <span className={cn("h-1.5 w-1.5 rounded-full", runState === "idle" ? "bg-fg-faint" : "animate-pulse bg-accent")} />
        {runState === "idle" ? "Ready" : runState === "starting" ? "Starting…" : "Running · simulated"}
      </span>

      <div className="ml-auto flex items-center gap-3 px-1.5">
        {inCall && (
          <span className="hidden animate-fade-in items-center gap-1 text-accent sm:flex">
            <Video className="h-3 w-3" /> In call · {callCount}
          </span>
        )}
        {cursor && (
          <span className="tabular-nums">
            Ln {cursor.line}, Col {cursor.col}
          </span>
        )}
        <span className="hidden md:inline">Spaces: 2</span>
        <span className="hidden md:inline">UTF-8</span>
        {language && <span className="hidden sm:inline">{language}</span>}
        <span className="hidden items-center gap-1 lg:flex" title="Real-time sync arrives with Yjs">
          <Radio className="h-3 w-3" /> Local session
        </span>
      </div>
    </footer>
  );
}
