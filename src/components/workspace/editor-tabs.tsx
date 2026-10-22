"use client";

import { X } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/cn";
import { FileIcon } from "./file-icon";

export function EditorTabs({
  tabs,
  active,
  dirty,
  onSelect,
  onClose,
}: {
  tabs: string[];
  active: string | null;
  dirty: Set<string>;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
}) {
  const activeRef = useRef<HTMLDivElement>(null);

  // Keep the active tab visible when it changes (e.g. opened from the explorer).
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [active]);

  return (
    <div
      role="tablist"
      aria-label="Open files"
      className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-sunken [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((path) => {
        const isActive = path === active;
        const isDirty = dirty.has(path);
        const name = path.split("/").pop();
        return (
          <div
            key={path}
            ref={isActive ? activeRef : undefined}
            className={cn(
              "group relative flex shrink-0 animate-fade-in items-center border-r border-line text-[12.5px] transition-colors duration-150",
              isActive ? "-mb-px bg-panel text-fg" : "text-fg-subtle hover:bg-panel/60 hover:text-fg-muted",
            )}
          >
            {isActive && <span className="absolute inset-x-0 top-0 h-[2px] bg-accent" />}
            <button
              type="button"
              role="tab"
              aria-selected={isActive}
              title={path}
              onClick={() => onSelect(path)}
              onAuxClick={(e) => {
                if (e.button === 1) onClose(path);
              }}
              className="flex h-full items-center gap-2 pl-3 pr-1 focus-visible:outline-offset-[-2px]"
            >
              <FileIcon path={path} className="h-3.5 w-3.5" />
              {name}
            </button>
            <button
              type="button"
              onClick={() => onClose(path)}
              aria-label={`Close ${name}${isDirty ? " (unsaved changes)" : ""}`}
              className="mr-1.5 inline-flex h-5 w-5 items-center justify-center rounded text-fg-faint transition-colors hover:bg-hover hover:text-fg"
            >
              {isDirty ? (
                <>
                  <span className="h-[7px] w-[7px] rounded-full bg-fg-muted group-hover:hidden" />
                  <X className="hidden h-3.5 w-3.5 group-hover:block" />
                </>
              ) : (
                <X className={cn("h-3.5 w-3.5", isActive ? "opacity-100" : "opacity-0 group-hover:opacity-100")} />
              )}
            </button>
          </div>
        );
      })}
      <div className="flex-1" />
    </div>
  );
}
