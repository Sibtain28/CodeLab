"use client";

import { CircleX, Cloud, CloudOff, GitBranch, LoaderCircle, Radio, TriangleAlert, Users, Video } from "lucide-react";
import { cn } from "@/lib/cn";
import type { RunState } from "./toolbar";

export function StatusBar({
  persisted = false,
  live = null,
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
  persisted?: boolean;
  /** Live collaboration state, when enabled. */
  live?: { status: "connecting" | "connected" | "offline" | "denied"; others: number; detail?: string } | null;
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
        {live ? (
          live.status === "connected" ? (
            <span className="flex items-center gap-1 text-accent" title="Live editing is on. ⌘S saves the shared file for everyone." role="status">
              <Users className="h-3 w-3" /> Live{live.others > 0 ? ` · ${live.others} other${live.others === 1 ? "" : "s"}` : ""}
            </span>
          ) : live.status === "connecting" ? (
            <span className="flex items-center gap-1" role="status">
              <LoaderCircle className="h-3 w-3 animate-spin" /> Connecting…
            </span>
          ) : live.status === "offline" ? (
            <span className="flex items-center gap-1 text-warning" title="Your edits are kept and sync when the connection returns." role="status">
              <CloudOff className="h-3 w-3" /> Offline — reconnecting
            </span>
          ) : (
            <span className="flex items-center gap-1 text-warning" title={live.detail ?? "The live session refused this connection."} role="status">
              <TriangleAlert className="h-3 w-3" /> Live editing off
            </span>
          )
        ) : persisted ? (
          <span className="hidden items-center gap-1 lg:flex" title="⌘S saves to your account. Real-time sync arrives with Yjs.">
            <Cloud className="h-3 w-3" /> Saved with ⌘S
          </span>
        ) : (
          <span className="hidden items-center gap-1 lg:flex" title="Sample workspace — nothing is saved. Real-time sync arrives with Yjs.">
            <Radio className="h-3 w-3" /> Local session
          </span>
        )}
      </div>
    </footer>
  );
}
