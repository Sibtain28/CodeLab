"use client";

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type SyntheticEvent,
} from "react";
import { TokenLine } from "@/components/code/highlighted-lines";
import { cn } from "@/lib/cn";
import { tokenize, type LanguageId } from "@/lib/highlight";
import type { PeerColor } from "@/lib/mock/people";
import type { Problem } from "@/lib/mock/workspace";

const LINE = 22; // px — must match leading-[22px] / h-[22px]
const PAD_Y = 12; // px — must match py-3

export interface EditorPeerCursor {
  id: string;
  name: string;
  color: PeerColor;
  line: number;
  col: number;
}

const caretBg: Record<PeerColor, string> = {
  accent: "bg-accent",
  violet: "bg-peer-violet",
  sky: "bg-peer-sky",
  amber: "bg-peer-amber",
  rose: "bg-peer-rose",
};

const labelCls: Record<PeerColor, string> = {
  accent: "bg-accent text-white",
  violet: "bg-peer-violet text-white",
  sky: "bg-peer-sky text-white",
  amber: "bg-peer-amber text-white",
  rose: "bg-peer-rose text-white",
};

const lineTint: Record<PeerColor, string> = {
  accent: "bg-accent/[0.05]",
  violet: "bg-peer-violet/[0.06]",
  sky: "bg-peer-sky/[0.06]",
  amber: "bg-peer-amber/[0.07]",
  rose: "bg-peer-rose/[0.06]",
};

function positionFromOffset(text: string, offset: number) {
  const before = text.slice(0, offset);
  const line = before.split("\n").length;
  const col = offset - before.lastIndexOf("\n");
  return { line, col };
}

/**
 * Phase 1 editor: a transparent <textarea> layered over a highlighted
 * <pre>. Gives real local typing, selection and undo without Monaco.
 * Collaborator cursors are static mock positions.
 */
export function CodeEditor({
  value,
  language,
  onChange,
  onCursorChange,
  peers,
  problems,
  reveal,
}: {
  value: string;
  language: LanguageId;
  onChange: (value: string) => void;
  onCursorChange: (pos: { line: number; col: number }) => void;
  peers: EditorPeerCursor[];
  problems: Problem[];
  /** When `nonce` changes, scroll the given line into view. */
  reveal?: { line: number; nonce: number } | null;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [currentLine, setCurrentLine] = useState(1);

  const lines = useMemo(() => tokenize(value, language), [value, language]);
  const rawLines = useMemo(() => value.split("\n"), [value]);
  const gutterWidth = `${Math.max(2, String(lines.length).length) + 4}ch`;

  const problemsByLine = useMemo(() => {
    const map = new Map<number, Problem>();
    for (const p of problems) {
      const existing = map.get(p.line);
      if (!existing || p.severity === "error") map.set(p.line, p);
    }
    return map;
  }, [problems]);

  useEffect(() => {
    if (!reveal || !scrollRef.current) return;
    const el = scrollRef.current;
    el.scrollTo({
      top: Math.max(0, (reveal.line - 1) * LINE - el.clientHeight / 3),
      behavior: "smooth",
    });
  }, [reveal]);

  function syncCursor(e: SyntheticEvent<HTMLTextAreaElement>) {
    const el = e.currentTarget;
    const pos = positionFromOffset(el.value, el.selectionStart);
    setCurrentLine(pos.line);
    onCursorChange(pos);
  }

  function insert(text: string) {
    const el = textareaRef.current;
    if (!el) return;
    // execCommand keeps the browser's native undo stack intact.
    const ok = document.execCommand?.("insertText", false, text);
    if (!ok) {
      const { selectionStart: s, selectionEnd: end } = el;
      const next = el.value.slice(0, s) + text + el.value.slice(end);
      onChange(next);
      requestAnimationFrame(() => {
        el.selectionStart = el.selectionEnd = s + text.length;
      });
    }
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab" && !e.shiftKey && !e.metaKey && !e.ctrlKey) {
      e.preventDefault();
      insert("  ");
      return;
    }
    if (e.key === "Enter" && !e.metaKey && !e.ctrlKey && !e.altKey) {
      const el = e.currentTarget;
      const lineStart = el.value.lastIndexOf("\n", el.selectionStart - 1) + 1;
      const indent = /^[ \t]*/.exec(el.value.slice(lineStart, el.selectionStart))?.[0] ?? "";
      const prevChar = el.value[el.selectionStart - 1];
      const extra = prevChar && "{[(".includes(prevChar) ? "  " : "";
      if (indent || extra) {
        e.preventDefault();
        insert(`\n${indent}${extra}`);
      }
    }
  }

  return (
    <div
      ref={scrollRef}
      className="relative h-full overflow-auto bg-panel font-mono text-[13px] leading-[22px]"
      onClick={(e) => {
        if (e.target === e.currentTarget) textareaRef.current?.focus();
      }}
    >
      <div className="relative flex min-h-full w-max min-w-full">
        {/* Gutter */}
        <div
          aria-hidden="true"
          className="sticky left-0 z-10 shrink-0 select-none bg-panel py-3 text-right"
          style={{ width: gutterWidth }}
        >
          {lines.map((_, i) => {
            const problem = problemsByLine.get(i + 1);
            return (
              <div
                key={i}
                className={cn(
                  "relative h-[22px] pr-3 tabular-nums",
                  i + 1 === currentLine ? "text-fg-muted" : "text-fg-faint",
                )}
              >
                {problem && (
                  <span
                    className={cn(
                      "absolute left-2 top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full",
                      problem.severity === "error" ? "bg-danger" : "bg-warning",
                    )}
                  />
                )}
                {i + 1}
              </div>
            );
          })}
        </div>

        {/* Code */}
        <div className="relative min-w-0 flex-1">
          {/* Current line + peer line tints */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 h-[22px] bg-[#f6f6f1] transition-[top] duration-75"
            style={{ top: PAD_Y + (currentLine - 1) * LINE }}
          />
          {peers.map((p) =>
            p.line <= lines.length ? (
              <div
                key={`tint-${p.id}`}
                aria-hidden="true"
                className={cn("pointer-events-none absolute inset-x-0 h-[22px]", lineTint[p.color])}
                style={{ top: PAD_Y + (p.line - 1) * LINE }}
              />
            ) : null,
          )}

          <pre
            aria-hidden="true"
            className="pointer-events-none relative m-0 whitespace-pre py-3 pl-4 pr-16 [tab-size:2]"
          >
            {lines.map((tokens, i) => (
              <div key={i} className="h-[22px]">
                <TokenLine tokens={tokens} />
              </div>
            ))}
          </pre>

          {/* Diagnostics underline */}
          {problems.map((p) => {
            const text = rawLines[p.line - 1];
            if (text === undefined) return null;
            const word = /^[\w$.]+/.exec(text.slice(p.col - 1))?.[0] ?? "";
            return (
              <span
                key={`${p.line}:${p.col}:${p.code}`}
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute h-[2px] rounded-full opacity-80",
                  p.severity === "error"
                    ? "bg-[repeating-linear-gradient(90deg,var(--color-danger)_0_3px,transparent_3px_5px)]"
                    : "bg-[repeating-linear-gradient(90deg,var(--color-warning)_0_3px,transparent_3px_5px)]",
                )}
                style={{
                  top: PAD_Y + p.line * LINE - 3,
                  left: `calc(1rem + ${p.col - 1}ch)`,
                  width: `${Math.max(word.length, 1)}ch`,
                }}
              />
            );
          })}

          {/* Collaborator cursors (mock positions) */}
          {peers.map((p) =>
            p.line <= lines.length ? (
              <span
                key={p.id}
                aria-hidden="true"
                className="pointer-events-none absolute z-10 h-[22px]"
                style={{
                  top: PAD_Y + (p.line - 1) * LINE,
                  left: `calc(1rem + ${p.col}ch)`,
                }}
              >
                <span className={cn("absolute left-0 top-0 h-[22px] w-[2px] rounded-full", caretBg[p.color])} />
                <span
                  className={cn(
                    "absolute left-0 whitespace-nowrap rounded-[4px] px-1.5 py-px font-sans text-[10px] font-semibold leading-[14px] shadow-sm",
                    p.line === 1 ? "top-[22px] rounded-tl-none" : "-top-4 rounded-bl-none",
                    labelCls[p.color],
                  )}
                >
                  {p.name}
                </span>
              </span>
            ) : null,
          )}

          <textarea
            ref={textareaRef}
            value={value}
            onChange={(e) => onChange(e.target.value)}
            onKeyDown={onKeyDown}
            onSelect={syncCursor}
            onClick={syncCursor}
            onKeyUp={syncCursor}
            wrap="off"
            spellCheck={false}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            aria-label="Code editor"
            aria-multiline="true"
            className="absolute inset-0 z-[5] m-0 h-full w-full resize-none overflow-hidden whitespace-pre border-0 bg-transparent py-3 pl-4 pr-16 text-transparent caret-accent outline-none [tab-size:2] selection:bg-accent/20 selection:text-transparent"
          />
        </div>
      </div>
    </div>
  );
}
