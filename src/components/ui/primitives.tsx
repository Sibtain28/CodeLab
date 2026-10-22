import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Kbd({ children }: { children: ReactNode }) {
  return (
    <kbd className="inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-[4px] border border-line-strong bg-panel px-1 font-mono text-[10.5px] font-medium text-fg-subtle shadow-[0_1px_0_var(--color-line-strong)]">
      {children}
    </kbd>
  );
}

type BadgeTone = "neutral" | "accent" | "info" | "warning" | "danger" | "success";

const tones: Record<BadgeTone, string> = {
  neutral: "bg-raised text-fg-muted ring-line",
  accent: "bg-accent-soft text-accent ring-accent-line",
  info: "bg-[#eaf1f9] text-info ring-[#d3e2f2]",
  warning: "bg-[#fbf2e3] text-warning ring-[#f0dfc0]",
  danger: "bg-[#fbecea] text-danger ring-[#f2d3d0]",
  success: "bg-accent-soft text-success ring-accent-line",
};

export function Badge({
  children,
  tone = "neutral",
  className,
}: {
  children: ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-[5px] px-1.5 text-[11px] font-medium leading-[18px] ring-1 ring-inset",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Presence dot with a soft pulse. */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative inline-flex h-1.5 w-1.5", className)}>
      <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-accent opacity-40 [animation-duration:2s]" />
      <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-accent" />
    </span>
  );
}

/** Small honest label for anything that is UI-only in this phase. */
export function MockBadge({ children = "Mock" }: { children?: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-[4px] border border-dashed border-line-strong px-1.5 font-mono text-[10px] uppercase leading-4 tracking-wider text-fg-subtle">
      {children}
    </span>
  );
}

/** Mono eyebrow label used for section kickers and metadata. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <p className={cn("font-mono text-[12.5px] text-fg-subtle", className)}>
      {children}
    </p>
  );
}
