"use client";

import { House, LayoutGrid, Plus, Settings, Star, Users } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { LiveDot } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import type { Project } from "@/lib/mock/projects";

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

function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <p className="px-2.5 pb-1.5 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-subtle">
      {children}
    </p>
  );
}

export function Sidebar({
  view,
  onViewChange,
  counts,
  liveProjects,
  onCreate,
}: {
  view: DashboardView;
  onViewChange: (v: DashboardView) => void;
  counts: Record<DashboardView, number | null>;
  liveProjects: Project[];
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

      {liveProjects.length > 0 && (
        <div className="mt-6 border-t border-line px-2.5 pt-4">
          <SectionLabel>Live now</SectionLabel>
          <div className="space-y-px">
            {liveProjects.map((p) => {
              const inner = (
                <>
                  <LiveDot />
                  <span className="flex-1 truncate font-mono text-[12.5px]">{p.name}</span>
                  <span className="font-mono text-[11px] text-fg-subtle">{p.liveCount}</span>
                </>
              );
              return p.hasWorkspace ? (
                <Link
                  key={p.id}
                  href={`/workspace/${p.id}`}
                  className="flex h-8 items-center gap-2.5 rounded-[7px] px-2.5 text-fg-muted transition-colors duration-150 hover:bg-hover/70 hover:text-fg"
                >
                  {inner}
                </Link>
              ) : (
                <div key={p.id} className="flex h-8 items-center gap-2.5 px-2.5 text-fg-subtle">
                  {inner}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="mt-auto space-y-1 border-t border-line p-2.5">
        <p className="px-2.5 py-2 text-[11.5px] leading-[17px] text-fg-subtle">
          <span className="font-medium text-fg-muted">Preview data.</span> Projects you create stay
          in this tab until you reload.
        </p>
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
