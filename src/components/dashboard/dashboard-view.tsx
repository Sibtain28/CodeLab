"use client";

import {
  Check,
  ChevronDown,
  LayoutGrid,
  Link2,
  List,
  Menu as MenuIcon,
  Plus,
  Search,
  Star,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { AvatarStack } from "@/components/ui/avatar";
import { Button, ButtonLink, IconButton, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { Kbd, LiveDot } from "@/components/ui/primitives";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  languageMeta,
  projects as seedProjects,
  type Language,
  type Project,
} from "@/lib/mock/projects";
import {
  CreateProjectDialog,
  JoinWorkspaceDialog,
  ShortcutsDialog,
  type NewProjectInput,
} from "./dialogs";
import { ProfileMenu } from "./profile-menu";
import { ProjectCard, ProjectRow } from "./project-card";
import { Sidebar, viewLabels, type DashboardView as View } from "./sidebar";

const languages = Object.keys(languageMeta) as Language[];

function isTypingTarget(target: EventTarget | null) {
  const el = target as HTMLElement | null;
  return !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.isContentEditable);
}

export function DashboardView() {
  const router = useRouter();
  const toast = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const localCounter = useRef(1);

  const [projects, setProjects] = useState<Project[]>(seedProjects);
  const [view, setView] = useState<View>("home");
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<Language | "all">("all");
  const [layout, setLayout] = useState<"grid" | "list">("list");
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (e.key === "?" && !isTypingTarget(e.target)) {
        setShortcutsOpen(true);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const counts = useMemo(
    () => ({
      home: null,
      projects: projects.length,
      shared: projects.filter((p) => p.ownership === "shared").length,
      starred: projects.filter((p) => p.starred).length,
    }),
    [projects],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter((p) => {
      if (view === "shared" && p.ownership !== "shared") return false;
      if (view === "starred" && !p.starred) return false;
      if (language !== "all" && p.language !== language) return false;
      if (!q) return true;
      return [p.name, p.description, p.language, p.framework].some((f) => f.toLowerCase().includes(q));
    });
  }, [projects, view, query, language]);

  const liveProjects = projects.filter((p) => p.liveCount > 0);
  const demo = projects.find((p) => p.hasWorkspace);

  function changeView(v: View) {
    setView(v);
    setMobileNavOpen(false);
  }

  function toggleStar(id: string) {
    setProjects((all) => all.map((p) => (p.id === id ? { ...p, starred: !p.starred } : p)));
  }

  function openUnavailable(project: Project) {
    toast({
      tone: "info",
      title: `${project.name} is sample data`,
      description: "Only the demo workspace opens in this preview. Real projects arrive with persistence.",
      action: { label: "Open demo workspace", onClick: () => router.push("/workspace/demo") },
    });
  }

  function createProject(input: NewProjectInput) {
    const project: Project = {
      id: `local-${localCounter.current++}`,
      name: input.name,
      description: input.description,
      language: input.language,
      framework: input.framework,
      lastEdited: "just now",
      lastEditedBy: "You",
      collaborators: [],
      liveCount: 0,
      ownership: "owned",
      starred: false,
      hasWorkspace: false,
      local: true,
    };
    setProjects((all) => [project, ...all]);
    setCreateOpen(false);
    setQuery("");
    setLanguage("all");
    if (view === "shared" || view === "starred") setView("projects");
    toast({
      title: `Created ${input.name}`,
      description: "Kept in this tab only — saving arrives with PostgreSQL + Prisma.",
    });
  }

  const sidebar = (
    <Sidebar
      view={view}
      onViewChange={changeView}
      counts={counts}
      liveProjects={liveProjects}
      onCreate={() => {
        setMobileNavOpen(false);
        setCreateOpen(true);
      }}
    />
  );

  const listed = view === "home" && !query && language === "all" ? visible.slice(0, 6) : visible;
  const filtered = !!query.trim() || language !== "all";

  return (
    <div className="flex h-dvh overflow-hidden bg-canvas">
      <aside className="hidden w-[236px] shrink-0 lg:block">{sidebar}</aside>

      {/* Mobile navigation drawer */}
      <div
        className={cn("fixed inset-0 z-50 lg:hidden", !mobileNavOpen && "pointer-events-none")}
        inert={!mobileNavOpen}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation"
      >
        <button
          type="button"
          aria-label="Close navigation"
          className={cn(
            "absolute inset-0 bg-fg/25 transition-opacity duration-300",
            mobileNavOpen ? "opacity-100" : "opacity-0",
          )}
          onClick={() => setMobileNavOpen(false)}
        />
        <aside
          className={cn(
            "relative h-full w-72 max-w-[85vw] bg-canvas shadow-pop transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
            mobileNavOpen ? "translate-x-0" : "-translate-x-full",
          )}
        >
          <div className="absolute right-2.5 top-3 z-10">
            <IconButton label="Close navigation" onClick={() => setMobileNavOpen(false)}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
          {sidebar}
        </aside>
      </div>

      <div className="flex min-w-0 flex-1 flex-col lg:py-2 lg:pr-2">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-panel lg:rounded-[12px] lg:shadow-card">
          <header className="relative z-30 flex h-14 shrink-0 items-center gap-3 border-b border-line px-3 sm:px-5">
            <IconButton label="Open navigation" className="lg:hidden" onClick={() => setMobileNavOpen(true)}>
              <MenuIcon className="h-4 w-4" />
            </IconButton>
            <div className="relative w-full max-w-[18rem]">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-[15px] w-[15px] -translate-y-1/2 text-fg-faint" />
              <input
                ref={searchRef}
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setQuery("");
                    e.currentTarget.blur();
                  }
                }}
                placeholder="Search projects"
                aria-label="Search projects"
                className="h-8 w-full rounded-[7px] bg-raised pl-8 pr-12 text-[13px] text-fg outline-none ring-1 ring-inset ring-transparent transition-[box-shadow,background-color] duration-150 placeholder:text-fg-faint hover:bg-hover focus:bg-panel focus:ring-accent/50 focus:shadow-[0_0_0_3px_rgb(38_115_77/0.12)] [&::-webkit-search-cancel-button]:hidden"
              />
              <span className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 gap-0.5 sm:flex">
                <Kbd>⌘</Kbd>
                <Kbd>K</Kbd>
              </span>
            </div>
            <div className="flex items-center gap-2 sm:ml-auto">
              <span className="hidden md:block">
                <Button variant="secondary" size="sm" onClick={() => setJoinOpen(true)}>
                  <Link2 className="h-3.5 w-3.5 text-fg-subtle" /> Join workspace
                </Button>
              </span>
              <Button variant="primary" size="sm" onClick={() => setCreateOpen(true)} aria-label="New project">
                <Plus className="h-4 w-4" />
                <span className="hidden sm:inline">New project</span>
              </Button>
              <span className="mx-1 hidden h-5 w-px bg-line sm:block" />
              <ProfileMenu onShowShortcuts={() => setShortcutsOpen(true)} />
            </div>
          </header>

          <main className="flex-1 overflow-y-auto">
            <div className="mx-auto max-w-[1040px] px-4 py-7 sm:px-8 sm:py-10">
              <section key={view} className="animate-rise">
                <h1 className="text-[22px] font-semibold tracking-[-0.025em] sm:text-[24px]">{viewLabels[view]}</h1>
                <p className="mt-1 text-[14px] text-fg-subtle">
                  {view === "home"
                    ? "Recent projects and sessions your team has open."
                    : view === "shared"
                      ? "Projects teammates have invited you to."
                      : view === "starred"
                        ? "Projects you have pinned for quick access."
                        : "Every project you own or have been invited to."}
                </p>

                {view === "home" && demo && demo.liveCount > 0 && (
                  <div className="mt-6 flex flex-col gap-3 rounded-[10px] border border-line px-4 py-3 sm:flex-row sm:items-center">
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <LiveDot className="mt-[7px]" />
                      <div className="min-w-0">
                        <p className="truncate text-[13.5px] text-fg">
                          <span className="font-mono font-medium">{demo.name}</span>
                          <span className="text-fg-muted"> · session in progress</span>
                        </p>
                        <p className="text-[12.5px] text-fg-subtle">Priya is editing MetricCard.tsx · call running</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 pl-[18px] sm:pl-0">
                      <AvatarStack people={demo.collaborators.slice(0, 3)} size="sm" />
                      <ButtonLink href="/workspace/demo" variant="secondary" size="sm">
                        Rejoin session
                      </ButtonLink>
                    </div>
                  </div>
                )}
              </section>

              <section aria-labelledby="projects-heading" className="mt-9">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 id="projects-heading" className="shrink-0 text-[13px] font-semibold text-fg">
                      {query.trim() ? `Results for “${query.trim()}”` : view === "home" ? "Recent projects" : "Projects"}
                    </h3>
                    <span className="font-mono text-[11.5px] text-fg-subtle">{visible.length}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    {view === "home" && !filtered && projects.length > 6 && (
                      <Button variant="ghost" size="xs" onClick={() => changeView("projects")}>
                        View all
                      </Button>
                    )}
                    <Menu
                      label="Filter by language"
                      trigger={({ toggle, open, ...aria }) => (
                        <button
                          type="button"
                          onClick={toggle}
                          {...aria}
                          className={cn(
                            buttonClasses({ variant: "ghost", size: "xs" }),
                            (open || language !== "all") && "bg-hover text-fg",
                          )}
                        >
                          {language === "all" ? "All languages" : language}
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      )}
                    >
                      {(close) => (
                        <>
                          <MenuLabel>Language</MenuLabel>
                          {(["all", ...languages] as const).map((l) => (
                            <MenuItem
                              key={l}
                              hint={language === l ? <Check className="h-3.5 w-3.5 text-accent" /> : undefined}
                              onSelect={() => {
                                setLanguage(l);
                                close();
                              }}
                            >
                              <span className="flex items-center gap-2">
                                {l !== "all" && (
                                  <span className="h-2 w-2 rounded-full" style={{ backgroundColor: languageMeta[l].color }} />
                                )}
                                {l === "all" ? "All languages" : l}
                              </span>
                            </MenuItem>
                          ))}
                        </>
                      )}
                    </Menu>
                    <div className="flex rounded-[8px] bg-raised p-0.5" role="group" aria-label="Layout">
                      {(
                        [
                          { id: "list", label: "List view", icon: List },
                          { id: "grid", label: "Grid view", icon: LayoutGrid },
                        ] as const
                      ).map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          aria-label={opt.label}
                          title={opt.label}
                          aria-pressed={layout === opt.id}
                          onClick={() => setLayout(opt.id)}
                          className={cn(
                            "inline-flex h-7 w-7 items-center justify-center rounded-[6px] transition-[background-color,box-shadow,color] duration-150",
                            layout === opt.id ? "bg-panel text-fg shadow-card" : "text-fg-subtle hover:text-fg",
                          )}
                        >
                          <opt.icon className="h-3.5 w-3.5" />
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {listed.length === 0 ? (
                  filtered ? (
                    <EmptyState
                      icon={<Search />}
                      title="No matching projects"
                      description={
                        query.trim()
                          ? `Nothing matches “${query.trim()}”${language !== "all" ? ` in ${language}` : ""}. Try a name, language or framework.`
                          : `No ${language} projects in this view.`
                      }
                      action={
                        <Button
                          size="sm"
                          onClick={() => {
                            setQuery("");
                            setLanguage("all");
                          }}
                        >
                          Clear filters
                        </Button>
                      }
                    />
                  ) : view === "starred" ? (
                    <EmptyState
                      icon={<Star />}
                      title="No starred projects yet"
                      description="Star a project to pin it here. Stars are kept for this session only."
                      action={
                        <Button size="sm" onClick={() => changeView("projects")}>
                          Browse projects
                        </Button>
                      }
                    />
                  ) : (
                    <EmptyState
                      icon={<LayoutGrid />}
                      title="No projects here"
                      description="Create a project or join a teammate’s workspace to get started."
                      action={
                        <>
                          <Button size="sm" variant="primary" onClick={() => setCreateOpen(true)}>
                            New project
                          </Button>
                          <Button size="sm" onClick={() => setJoinOpen(true)}>
                            Join workspace
                          </Button>
                        </>
                      }
                    />
                  )
                ) : layout === "grid" ? (
                  <div key="grid" className="grid animate-fade-in gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {listed.map((p) => (
                      <ProjectCard key={p.id} project={p} onToggleStar={toggleStar} onOpenUnavailable={openUnavailable} />
                    ))}
                  </div>
                ) : (
                  <div key="list" role="table" aria-label="Projects" className="animate-fade-in overflow-hidden rounded-xl ring-1 ring-line">
                    <div
                      role="row"
                      className="hidden grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_88px_auto] gap-4 border-b border-line bg-canvas/60 px-4 py-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-subtle md:grid"
                    >
                      <span role="columnheader">Name</span>
                      <span role="columnheader">Language</span>
                      <span role="columnheader">People</span>
                      <span role="columnheader" className="text-right">Edited</span>
                      <span role="columnheader" className="w-7">
                        <span className="sr-only">Star</span>
                      </span>
                    </div>
                    <div className="divide-y divide-line">
                      {listed.map((p) => (
                        <ProjectRow key={p.id} project={p} onToggleStar={toggleStar} onOpenUnavailable={openUnavailable} />
                      ))}
                    </div>
                  </div>
                )}
              </section>

              <div className="mt-10 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12.5px] text-fg-subtle md:hidden">
                <button type="button" onClick={() => setJoinOpen(true)} className="inline-flex items-center gap-1.5 hover:text-fg">
                  <Link2 className="h-3.5 w-3.5" /> Join a workspace
                </button>
              </div>
            </div>
          </main>
        </div>
      </div>

      <CreateProjectDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreate={createProject}
        existingNames={projects.map((p) => p.name)}
      />
      <JoinWorkspaceDialog open={joinOpen} onClose={() => setJoinOpen(false)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </div>
  );
}
