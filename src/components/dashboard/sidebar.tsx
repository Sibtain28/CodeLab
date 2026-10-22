"use client";

import { House, LayoutGrid, Play, Plus, Settings, Star, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { cn } from "@/lib/cn";

export type DashboardView = "home" | "projects" | "shared" | "starred";

export const viewLabels: Record<DashboardView, string> = {
  home: "Home",
  projects: "All projects",
  shared: "Shared with me",
  starred: "Starred",
};

const icons: Record<DashboardView, ReactNode> = {
  home: <House />,
  projects: <LayoutGrid />,
  shared: <Users />,
  starred: <Star />,
};

export function Sidebar({
  view,
  onViewChange,
  counts,
  onCreate,
}: {
  view: DashboardView;
  onViewChange: (v: DashboardView) => void;
  counts: Record<DashboardView, number | null>;
  onCreate: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center px-4">
        <Logo />
      </div>

      <div className="px-2.5">
        <button
          type="button"
          onClick={onCreate}
          className="flex h-8 w-full items-center gap-2 rounded-[7px] bg-panel px-2.5 text-[13px] font-medium text-fg shadow-card transition-shadow duration-150 hover:shadow-lift"
        >
          <Plus className="h-4 w-4 text-accent" /> New project
        </button>
      </div>

      <nav aria-label="Dashboard" className="mt-5 space-y-px px-2.5">
        {(Object.keys(viewLabels) as DashboardView[]).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onViewChange(v)}
            aria-current={view === v ? "page" : undefined}
            className={cn(
              "flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] transition-colors duration-150 [&_svg]:h-4 [&_svg]:w-4",
              view === v
                ? "bg-hover font-medium text-fg [&_svg]:text-accent"
                : "text-fg-muted hover:bg-hover/70 hover:text-fg [&_svg]:text-fg-subtle",
            )}
          >
            {icons[v]}
            <span className="flex-1 text-left">{viewLabels[v]}</span>
            {counts[v] !== null && (
              <span className="font-mono text-[11px] tabular-nums text-fg-subtle">{counts[v]}</span>
            )}
          </button>
        ))}
      </nav>

      <div className="mt-auto space-y-1 border-t border-line p-2.5">
        <Link
          href="/workspace/demo"
          className="flex h-8 w-full items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] text-fg-muted transition-colors duration-150 hover:bg-hover/70 hover:text-fg"
        >
          <Play className="h-4 w-4 text-fg-subtle" />
          <span className="flex-1 text-left">Demo workspace</span>
          <span className="font-mono text-[10px] uppercase tracking-wider text-fg-subtle">Sample</span>
        </Link>
        <button
          type="button"
          disabled
          className="flex h-8 w-full cursor-not-allowed items-center gap-2.5 rounded-[7px] px-2.5 text-[13px] text-fg-subtle"
        >
          <Settings className="h-4 w-4" />
          <span className="flex-1 text-left">Settings</span>
          <span className="font-mono text-[10px] uppercase tracking-wider">Soon</span>
        </button>
      </div>
    </div>
  );
}
