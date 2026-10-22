"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/**
 * Lightweight dropdown menu. Closes on outside click, Escape, and after an
 * item is chosen. The panel stays mounted (inert while closed) so it can
 * animate both in and out.
 */
export function Menu({
  trigger,
  children,
  align = "end",
  className,
  label,
}: {
  trigger: (props: {
    open: boolean;
    toggle: () => void;
    "aria-expanded": boolean;
    "aria-haspopup": "menu";
  }) => ReactNode;
  children: (close: () => void) => ReactNode;
  align?: "start" | "end";
  className?: string;
  label: string;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <div ref={rootRef} className="relative">
      {trigger({
        open,
        toggle: () => setOpen((v) => !v),
        "aria-expanded": open,
        "aria-haspopup": "menu",
      })}
      <div
        role="menu"
        aria-label={label}
        inert={!open}
        className={cn(
          "absolute top-[calc(100%+6px)] z-50 min-w-56 rounded-[10px] bg-overlay p-1 shadow-pop transition-[opacity,transform,visibility] duration-150 ease-out",
          align === "end" ? "right-0 origin-top-right" : "left-0 origin-top-left",
          open ? "visible scale-100 opacity-100" : "invisible -translate-y-1 scale-[0.97] opacity-0",
          className,
        )}
      >
        {children(close)}
      </div>
    </div>
  );
}

export function MenuItem({
  icon,
  children,
  onSelect,
  disabled,
  hint,
}: {
  icon?: ReactNode;
  children: ReactNode;
  onSelect?: () => void;
  disabled?: boolean;
  hint?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      disabled={disabled}
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-[7px] px-2.5 py-[7px] text-left text-[13px] text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent disabled:hover:text-fg-muted"
    >
      {icon && <span className="text-fg-subtle [&_svg]:h-4 [&_svg]:w-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {hint && <span className="text-[11px] text-fg-subtle">{hint}</span>}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className="-mx-1 my-1 h-px bg-line" />;
}

export function MenuLabel({ children }: { children: ReactNode }) {
  return (
    <div className="px-2.5 pb-1 pt-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-subtle">
      {children}
    </div>
  );
}
