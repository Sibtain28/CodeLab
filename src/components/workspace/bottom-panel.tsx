"use client";

import {
  ChevronDown,
  CircleX,
  Eraser,
  Sparkles,
  TriangleAlert,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { IconButton } from "@/components/ui/button";
import { MockBadge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { Problem } from "@/lib/mock/workspace";

export type BottomTab = "terminal" | "output" | "problems";

export interface OutputLine {
  id: number;
  text: string;
  tone?: "muted" | "success" | "warning" | "error" | "accent";
}

export interface TerminalLine {
  id: number;
  kind: "input" | "output" | "system";
  text: string;
}

export interface DiagnosticFix {
  explanation: string;
  label: string;
  apply: () => void;
}

const toneCls: Record<NonNullable<OutputLine["tone"]>, string> = {
  muted: "text-fg-subtle",
  success: "text-success",
  warning: "text-warning",
  error: "text-danger",
  accent: "text-accent",
};

export const PROMPT = "~/orbit-dashboard on main";

export function BottomPanel({
  tab,
  onTabChange,
  onClose,
  terminal,
  onTerminalCommand,
  onClearTerminal,
  output,
  onClearOutput,
  problems,
  onOpenProblem,
  getFix,
  running,
}: {
  tab: BottomTab;
  onTabChange: (t: BottomTab) => void;
  onClose: () => void;
  terminal: TerminalLine[];
  onTerminalCommand: (cmd: string) => void;
  onClearTerminal: () => void;
  output: OutputLine[];
  onClearOutput: () => void;
  problems: Problem[];
  onOpenProblem: (p: Problem) => void;
  getFix: (p: Problem) => DiagnosticFix | null;
  running: boolean;
}) {
  const tabs: { id: BottomTab; label: string; badge?: ReactNode }[] = [
    { id: "terminal", label: "Terminal" },
    {
      id: "output",
      label: "Output",
      badge: running ? <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" /> : null,
    },
    {
      id: "problems",
      label: "Problems",
      badge:
        problems.length > 0 ? (
          <span className="rounded-full bg-raised px-1.5 font-mono text-[10px] leading-4 text-fg-muted">
            {problems.length}
          </span>
        ) : null,
    },
  ];

  return (
    <div className="flex h-full flex-col bg-panel">
      <div className="flex h-9 shrink-0 items-center justify-between border-b border-line pl-1.5 pr-1.5">
        <div role="tablist" aria-label="Panel" className="flex h-full items-stretch">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => onTabChange(t.id)}
              className={cn(
                "relative flex items-center gap-1.5 px-3 text-[12.5px] font-medium transition-colors duration-150 focus-visible:outline-offset-[-2px]",
                tab === t.id ? "text-fg" : "text-fg-subtle hover:text-fg-muted",
              )}
            >
              {t.label}
              {t.badge}
              {tab === t.id && <span className="absolute inset-x-3 -bottom-px h-[2px] animate-fade-in bg-accent" />}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1">
          {tab !== "problems" && (
            <IconButton
              label={tab === "terminal" ? "Clear terminal" : "Clear output"}
              size="sm"
              tooltipSide="top"
              onClick={tab === "terminal" ? onClearTerminal : onClearOutput}
            >
              <Eraser className="h-3.5 w-3.5" />
            </IconButton>
          )}
          <IconButton label="Hide panel (⌘J)" size="sm" tooltipSide="top" onClick={onClose}>
            <ChevronDown className="h-4 w-4" />
          </IconButton>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        {tab === "terminal" && <Terminal lines={terminal} onCommand={onTerminalCommand} />}
        {tab === "output" && <Output lines={output} running={running} />}
        {tab === "problems" && (
          <Problems problems={problems} onOpen={onOpenProblem} getFix={getFix} />
        )}
      </div>
    </div>
  );
}

function useAutoScroll(dep: unknown) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [dep]);
  return ref;
}

function Terminal({
  lines,
  onCommand,
}: {
  lines: TerminalLine[];
  onCommand: (cmd: string) => void;
}) {
  const [input, setInput] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [cursor, setCursor] = useState<number | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useAutoScroll(lines.length);

  return (
    <div
      ref={scrollRef}
      className="h-full overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[20px]"
      onClick={() => {
        if (!window.getSelection()?.toString()) inputRef.current?.focus();
      }}
    >
      {lines.map((l) => (
        <div
          key={l.id}
          className={cn(
            "whitespace-pre-wrap break-words",
            l.kind === "system" && "text-fg-subtle",
            l.kind === "output" && "text-fg-muted",
            l.kind === "input" && "text-fg",
          )}
        >
          {l.kind === "input" ? (
            <>
              <span className="text-accent">{PROMPT}</span> <span className="text-fg-faint">❯</span> {l.text}
            </>
          ) : (
            l.text
          )}
        </div>
      ))}
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const cmd = input.trim();
          onCommand(cmd);
          if (cmd) setHistory((h) => [...h, cmd]);
          setInput("");
          setCursor(null);
        }}
      >
        <label htmlFor="terminal-input" className="shrink-0">
          <span className="text-accent">{PROMPT}</span> <span className="text-fg-faint">❯</span>
        </label>
        <input
          id="terminal-input"
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp" && history.length) {
              e.preventDefault();
              const next = cursor === null ? history.length - 1 : Math.max(0, cursor - 1);
              setCursor(next);
              setInput(history[next]);
            } else if (e.key === "ArrowDown" && cursor !== null) {
              e.preventDefault();
              const next = cursor + 1;
              if (next >= history.length) {
                setCursor(null);
                setInput("");
              } else {
                setCursor(next);
                setInput(history[next]);
              }
            }
          }}
          autoComplete="off"
          spellCheck={false}
          aria-label="Terminal command"
          className="min-w-0 flex-1 bg-transparent text-fg caret-accent outline-none"
        />
      </form>
    </div>
  );
}

function Output({ lines, running }: { lines: OutputLine[]; running: boolean }) {
  const scrollRef = useAutoScroll(lines.length);
  return (
    <div ref={scrollRef} className="h-full overflow-y-auto px-4 py-3 font-mono text-[12.5px] leading-[20px]">
      {lines.length === 0 ? (
        <p className="font-sans text-[12.5px] text-fg-subtle">
          No output yet. Press <span className="text-fg-muted">Run</span> or{" "}
          <span className="text-fg-muted">⌘↵</span> to start a simulated run.
        </p>
      ) : (
        lines.map((l) => (
          <div key={l.id} className={cn("whitespace-pre-wrap", l.tone ? toneCls[l.tone] : "text-fg-muted")}>
            {l.text || " "}
          </div>
        ))
      )}
      {running && <span className="inline-block h-4 w-[7px] translate-y-0.5 animate-blink bg-fg-subtle" />}
    </div>
  );
}

function Problems({
  problems,
  onOpen,
  getFix,
}: {
  problems: Problem[];
  onOpen: (p: Problem) => void;
  getFix: (p: Problem) => DiagnosticFix | null;
}) {
  const [explaining, setExplaining] = useState<string | null>(null);

  if (problems.length === 0) {
    return (
      <div className="flex h-full items-center justify-center px-4 text-[12.5px] text-fg-subtle">
        No problems detected in the workspace.
      </div>
    );
  }

  return (
    <ul className="h-full overflow-y-auto py-1">
      {problems.map((p) => {
        const key = `${p.file}:${p.line}:${p.code}`;
        const fix = getFix(p);
        const open = explaining === key;
        return (
          <li key={key} className="border-b border-line/60 last:border-0">
            <div className="flex items-start gap-2.5 px-4 py-2 text-[12.5px] transition-colors duration-100 hover:bg-canvas">
              {p.severity === "error" ? (
                <CircleX className="mt-0.5 h-3.5 w-3.5 shrink-0 text-danger" />
              ) : (
                <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0 text-warning" />
              )}
              <button type="button" onClick={() => onOpen(p)} className="min-w-0 flex-1 text-left">
                <span className="text-fg-muted">{p.message}</span>{" "}
                <span className="font-mono text-[11.5px] text-fg-subtle">
                  {p.code} · {p.file.split("/").pop()}:{p.line}:{p.col}
                </span>
              </button>
              {fix && (
                <button
                  type="button"
                  onClick={() => setExplaining(open ? null : key)}
                  aria-expanded={open}
                  className="inline-flex shrink-0 items-center gap-1 rounded-[6px] bg-accent-soft px-2 py-0.5 text-[11.5px] font-medium text-accent ring-1 ring-inset ring-accent-line transition-colors hover:bg-[#e2efe7]"
                >
                  <Sparkles className="h-3 w-3" /> Explain
                </button>
              )}
            </div>
            {open && fix && (
              <div className="mx-4 mb-3 animate-rise rounded-[10px] bg-canvas p-3.5 ring-1 ring-inset ring-line">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-1.5 text-[11.5px] font-medium text-fg">
                    <Sparkles className="h-3.5 w-3.5 text-accent" /> AI-assisted debugging
                  </p>
                  <MockBadge>Sample · AI not connected</MockBadge>
                </div>
                <p className="mt-2 text-[12.5px] leading-5 text-fg-muted">{fix.explanation}</p>
                <button
                  type="button"
                  onClick={() => {
                    fix.apply();
                    setExplaining(null);
                  }}
                  className="mt-3 inline-flex items-center gap-1.5 rounded-[6px] bg-accent px-2.5 py-1 text-[11.5px] font-medium text-white transition-colors hover:bg-accent-strong"
                >
                  <Wand2 className="h-3 w-3" /> {fix.label}
                </button>
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
