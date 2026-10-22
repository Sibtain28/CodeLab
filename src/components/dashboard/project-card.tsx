"use client";

import { Star } from "lucide-react";
import Link from "next/link";
import { AvatarStack } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { languageMeta, type Language, type ProjectSummary as Project } from "@/lib/projects";

export function LanguageGlyph({ language, size = "md" }: { language: Language; size?: "sm" | "md" }) {
  const meta = languageMeta[language];
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-[7px] font-mono font-semibold",
        size === "md" ? "h-9 w-9 text-[11px]" : "h-7 w-7 text-[10px]",
      )}
      style={{
        color: meta.color,
        backgroundColor: `${meta.color}12`,
        boxShadow: `inset 0 0 0 1px ${meta.color}26`,
      }}
    >
      {meta.short}
    </span>
  );
}

function LanguageLabel({ project }: { project: Project }) {
  return (
    <span className="flex min-w-0 items-center gap-1.5 text-[12.5px] text-fg-muted">
      <span
        className="h-2 w-2 shrink-0 rounded-full"
        style={{ backgroundColor: languageMeta[project.language].color }}
      />
      <span className="truncate">
        {project.language}
        {project.framework && <span className="text-fg-subtle"> · {project.framework}</span>}
      </span>
    </span>
  );
}

interface CardProps {
  project: Project;
  onToggleStar: (id: string) => void;
}

/** Stretched-link overlay: the whole item opens the project, while the star
 *  button stays independently clickable above it. */
function OpenOverlay({ project }: Pick<CardProps, "project">) {
  return (
    <Link
      href={`/workspace/${project.id}`}
      aria-label={`Open ${project.name}`}
      className="absolute inset-0 z-0 rounded-[inherit] focus-visible:outline-offset-[-2px]"
    />
  );
}

function StarButton({ project, onToggleStar }: Pick<CardProps, "project" | "onToggleStar">) {
  return (
    <button
      type="button"
      onClick={() => onToggleStar(project.id)}
      aria-pressed={project.starred}
      aria-label={project.starred ? `Unstar ${project.name}` : `Star ${project.name}`}
      className={cn(
        "relative z-10 inline-flex h-7 w-7 items-center justify-center rounded-md transition-[color,background-color,transform] duration-150 hover:bg-hover active:scale-90",
        project.starred ? "text-[#c58a17]" : "text-fg-faint hover:text-fg-muted",
      )}
    >
      <Star className={cn("h-[15px] w-[15px]", project.starred && "animate-check fill-current")} />
    </button>
  );
}

function Meta({ project }: { project: Project }) {
  if (project.role === "Owner") return null;
  return <Badge>{project.role}</Badge>;
}

function edited(project: Project) {
  return project.lastEditedBy ? `Edited ${project.updatedLabel} · ${project.lastEditedBy}` : `Updated ${project.updatedLabel}`;
}

export function ProjectCard(props: CardProps) {
  const { project } = props;
  return (
    <article className="group relative flex flex-col rounded-xl bg-panel p-4 shadow-card transition-[box-shadow,transform] duration-200 ease-out hover:-translate-y-px hover:shadow-lift focus-within:shadow-lift">
      <OpenOverlay project={project} />
      <div className="pointer-events-none relative flex items-start gap-3">
        <LanguageGlyph language={project.language} />
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-mono text-[13.5px] font-medium text-fg">{project.name}</h3>
          <p className="mt-0.5 text-[12px] text-fg-subtle">
            {edited(project)}
          </p>
        </div>
        <div className="pointer-events-auto -mr-1 -mt-0.5">
          <StarButton {...props} />
        </div>
      </div>
      <p className="pointer-events-none relative mt-3 line-clamp-2 min-h-10 text-[13px] leading-5 text-fg-muted">
        {project.description}
      </p>
      <div className="pointer-events-none relative mt-4 flex items-center justify-between gap-3">
        <span className="flex min-w-0 items-center gap-2">
          <LanguageLabel project={project} />
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <Meta project={project} />
          {project.others.length > 0 && <AvatarStack people={project.others} size="xs" max={3} />}
        </span>
      </div>
    </article>
  );
}

export function ProjectRow(props: CardProps) {
  const { project } = props;
  return (
    <div
      role="row"
      className="group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 px-4 py-3 transition-colors duration-150 hover:bg-canvas md:grid-cols-[minmax(0,2.2fr)_minmax(0,1.2fr)_minmax(0,0.9fr)_88px_auto]"
    >
      <OpenOverlay project={project} />
      <div role="cell" className="pointer-events-none relative flex min-w-0 items-center gap-3">
        <LanguageGlyph language={project.language} size="sm" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate font-mono text-[13px] font-medium text-fg">{project.name}</span>
            <Meta project={project} />
          </div>
          <p className="truncate text-[12.5px] text-fg-subtle">{project.description}</p>
        </div>
      </div>
      <div role="cell" className="pointer-events-none relative hidden md:block">
        <LanguageLabel project={project} />
      </div>
      <div role="cell" className="pointer-events-none relative hidden md:block">
        {project.others.length > 0 ? (
          <AvatarStack people={project.others} size="xs" max={3} />
        ) : (
          <span className="text-[12px] text-fg-subtle">Only you</span>
        )}
      </div>
      <div role="cell" className="pointer-events-none relative hidden text-right text-[12.5px] tabular-nums text-fg-subtle md:block">
        {project.updatedLabel}
      </div>
      <div role="cell" className="relative flex justify-end">
        <StarButton {...props} />
      </div>
    </div>
  );
}
