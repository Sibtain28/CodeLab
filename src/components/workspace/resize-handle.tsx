"use client";

import { useRef, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";

/**
 * Drag handle between panels. Reports pixel deltas; the parent owns and
 * clamps the size. Arrow keys resize in 16px steps for keyboard users.
 */
export function ResizeHandle({
  direction,
  onResize,
  label,
}: {
  /** "x" resizes width (vertical bar), "y" resizes height (horizontal bar). */
  direction: "x" | "y";
  onResize: (delta: number) => void;
  label: string;
}) {
  const last = useRef<number | null>(null);

  function onPointerDown(e: PointerEvent<HTMLDivElement>) {
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    last.current = direction === "x" ? e.clientX : e.clientY;
    document.body.style.cursor = direction === "x" ? "col-resize" : "row-resize";
    document.body.style.userSelect = "none";
  }

  function onPointerMove(e: PointerEvent<HTMLDivElement>) {
    if (last.current === null) return;
    const pos = direction === "x" ? e.clientX : e.clientY;
    const delta = pos - last.current;
    if (delta !== 0) {
      onResize(delta);
      last.current = pos;
    }
  }

  function end(e: PointerEvent<HTMLDivElement>) {
    if (last.current === null) return;
    last.current = null;
    e.currentTarget.releasePointerCapture(e.pointerId);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const step = 16;
    if (direction === "x" && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      onResize(e.key === "ArrowLeft" ? -step : step);
    }
    if (direction === "y" && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
      e.preventDefault();
      onResize(e.key === "ArrowUp" ? -step : step);
    }
  }

  return (
    <div
      role="separator"
      aria-orientation={direction === "x" ? "vertical" : "horizontal"}
      aria-label={label}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={end}
      onPointerCancel={end}
      onKeyDown={onKeyDown}
      className={cn(
        "group relative z-20 shrink-0 touch-none outline-none",
        direction === "x" ? "w-px cursor-col-resize bg-line" : "h-px cursor-row-resize bg-line",
      )}
    >
      <span
        className={cn(
          "absolute transition-colors duration-150 group-hover:bg-accent/35 group-hover:delay-150 group-focus-visible:bg-accent/60 group-active:bg-accent/70",
          direction === "x" ? "inset-y-0 -left-[2px] w-[5px]" : "inset-x-0 -top-[2px] h-[5px]",
        )}
      />
    </div>
  );
}
