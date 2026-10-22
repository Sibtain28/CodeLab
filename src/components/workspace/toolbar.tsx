"use client";

import {
  Check,
  ChevronRight,
  Globe,
  Link2,
  LoaderCircle,
  Lock,
  PanelBottom,
  PanelLeft,
  PanelRight,
  Play,
  Share2,
  Square,
  UserPlus,
  Users,
} from "lucide-react";
import Link from "next/link";
import { LogoMark } from "@/components/brand/logo";
import { AvatarStack } from "@/components/ui/avatar";
import { Button, IconButton, buttonClasses } from "@/components/ui/button";
import { Menu, MenuItem, MenuLabel, MenuSeparator } from "@/components/ui/menu";
import { cn } from "@/lib/cn";
import type { WorkspacePeer } from "@/lib/mock/workspace";

export type Visibility = "private" | "team" | "link";
export type RunState = "idle" | "starting" | "running";

const visibilityOptions: { id: Visibility; label: string; icon: typeof Lock; hint: string }[] = [
  { id: "private", label: "Private", icon: Lock, hint: "Only you" },
  { id: "team", label: "Team", icon: Users, hint: "Invited members" },
  { id: "link", label: "Anyone with the link", icon: Globe, hint: "Can view" },
];

export function Toolbar({
  name,
  branch,
  peers,
  explorerOpen,
  bottomOpen,
  collabOpen,
  onToggleExplorer,
  onToggleBottom,
  onToggleCollab,
  onInvite,
  onCopyLink,
  visibility,
  onVisibilityChange,
  runState,
  onRun,
  onStop,
}: {
  name: string;
  branch: string;
  peers: WorkspacePeer[];
  explorerOpen: boolean;
  bottomOpen: boolean;
  collabOpen: boolean;
  onToggleExplorer: () => void;
  onToggleBottom: () => void;
  onToggleCollab: () => void;
  onInvite: () => void;
  onCopyLink: () => void;
  visibility: Visibility;
  onVisibilityChange: (v: Visibility) => void;
  runState: RunState;
  onRun: () => void;
  onStop: () => void;
}) {
  const online = peers.filter((p) => p.status === "online");

  return (
    <header className="relative z-30 flex h-11 shrink-0 items-center gap-2 border-b border-line bg-panel px-2 sm:gap-3 sm:px-3">
      <Link
        href="/dashboard"
        aria-label="Back to dashboard"
        className="rounded-md p-1 transition-colors duration-150 hover:bg-hover"
      >
        <LogoMark size={20} />
      </Link>

      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1.5 text-[13px]">
        <Link href="/dashboard" className="hidden text-fg-subtle transition-colors hover:text-fg md:inline">
          Projects
        </Link>
        <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-fg-faint md:block" />
        <span className="truncate font-medium text-fg">{name}</span>
        <span className="hidden shrink-0 items-center rounded-[5px] bg-raised px-1.5 font-mono text-[11px] leading-[18px] text-fg-subtle sm:inline-flex">
          {branch}
        </span>
      </nav>

      <div className="ml-auto flex items-center gap-1 sm:gap-1.5">
        <button
          type="button"
          onClick={onToggleCollab}
          className="mr-1 hidden items-center gap-2 rounded-full py-0.5 pl-0.5 pr-2.5 transition-colors duration-150 hover:bg-hover md:flex"
          aria-label={`${online.length} collaborators online — toggle collaboration panel`}
        >
          <AvatarStack people={online} size="sm" max={3} />
          <span className="text-[12px] text-fg-subtle">{online.length + 1} here</span>
        </button>

        <div className="hidden items-center gap-px sm:flex" role="group" aria-label="Panels">
          <IconButton label="Explorer  ⌘B" size="sm" active={explorerOpen} aria-pressed={explorerOpen} onClick={onToggleExplorer}>
            <PanelLeft className="h-[15px] w-[15px]" />
          </IconButton>
          <IconButton label="Panel  ⌘J" size="sm" active={bottomOpen} aria-pressed={bottomOpen} onClick={onToggleBottom}>
            <PanelBottom className="h-[15px] w-[15px]" />
          </IconButton>
          <IconButton label="Collaboration  ⌘⇧K" size="sm" active={collabOpen} aria-pressed={collabOpen} onClick={onToggleCollab}>
            <PanelRight className="h-[15px] w-[15px]" />
          </IconButton>
        </div>

        <IconButton label="Files" className="sm:hidden" active={explorerOpen} onClick={onToggleExplorer}>
          <PanelLeft className="h-4 w-4" />
        </IconButton>
        <IconButton label="People & call" className="sm:hidden" active={collabOpen} onClick={onToggleCollab}>
          <Users className="h-4 w-4" />
        </IconButton>

        <span className="mx-1 hidden h-5 w-px bg-line sm:block" />

        <Menu
          label="Share"
          trigger={({ toggle, open, ...aria }) => (
            <button
              type="button"
              onClick={toggle}
              {...aria}
              aria-label="Share workspace"
              className={cn(buttonClasses({ variant: "ghost", size: "sm" }), "px-2 lg:px-2.5", open && "bg-hover text-fg")}
            >
              <Share2 className="h-3.5 w-3.5" />
              <span className="hidden lg:inline">Share</span>
            </button>
          )}
          className="w-72"
        >
          {(close) => (
            <>
              <MenuLabel>General access</MenuLabel>
              {visibilityOptions.map((opt) => (
                <MenuItem
                  key={opt.id}
                  icon={<opt.icon />}
                  hint={visibility === opt.id ? <Check className="h-3.5 w-3.5 text-accent" /> : undefined}
                  onSelect={() => onVisibilityChange(opt.id)}
                >
                  <span className="block text-fg">{opt.label}</span>
                  <span className="block text-[11.5px] text-fg-subtle">{opt.hint}</span>
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem
                icon={<Link2 />}
                onSelect={() => {
                  onCopyLink();
                  close();
                }}
              >
                Copy workspace link
              </MenuItem>
              <p className="px-2.5 pb-1.5 pt-2 text-[11.5px] leading-4 text-fg-subtle">
                Access settings are UI-only until accounts land.
              </p>
            </>
          )}
        </Menu>

        <button
          type="button"
          onClick={onInvite}
          aria-label="Invite collaborators"
          className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "px-2 lg:px-3")}
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span className="hidden lg:inline">Invite</span>
        </button>

        {runState === "idle" ? (
          <Button variant="primary" size="sm" onClick={onRun} title="Run (⌘↵)">
            <Play className="h-3 w-3 fill-current" />
            Run
          </Button>
        ) : (
          <Button variant="danger-outline" size="sm" onClick={onStop} title="Stop (⌘↵)">
            {runState === "starting" ? (
              <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Square className="h-2.5 w-2.5 fill-current" />
            )}
            Stop
          </Button>
        )}
      </div>
    </header>
  );
}
