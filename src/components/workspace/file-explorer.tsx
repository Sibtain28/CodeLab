"use client";

import { ChevronRight, ChevronsDownUp, FilePlus, Folder, FolderOpen } from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { IconButton } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { peerBg } from "@/lib/mock/people";
import type { WorkspacePeer } from "@/lib/mock/workspace";
import { FileIcon } from "./file-icon";

interface TreeNode {
  name: string;
  path: string;
  children?: TreeNode[];
}

/** Builds a sorted folder tree (folders first) from flat file paths. */
export function buildTree(paths: string[]): TreeNode[] {
  const root: TreeNode = { name: "", path: "", children: [] };
  for (const path of paths) {
    const parts = path.split("/");
    let node = root;
    parts.forEach((part, i) => {
      const isFile = i === parts.length - 1;
      const childPath = parts.slice(0, i + 1).join("/");
      node.children ??= [];
      let child = node.children.find((c) => c.name === part && !!c.children === !isFile);
      if (!child) {
        child = isFile ? { name: part, path: childPath } : { name: part, path: childPath, children: [] };
        node.children.push(child);
      }
      node = child;
    });
  }
  const sort = (nodes: TreeNode[]) => {
    nodes.sort((a, b) => {
      if (!!a.children !== !!b.children) return a.children ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => n.children && sort(n.children));
  };
  sort(root.children!);
  return root.children!;
}

export function allFolders(paths: string[]): string[] {
  const set = new Set<string>();
  for (const p of paths) {
    const parts = p.split("/");
    for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join("/"));
  }
  return [...set];
}

const VALID_PATH = /^(?!\/)(?!.*\/\/)[\w.-]+(?:\/[\w.-]+)*$/;

export function FileExplorer({
  workspaceName,
  paths,
  activePath,
  dirty,
  expanded,
  onToggleFolder,
  onCollapseAll,
  onOpenFile,
  onCreateFile,
  peers,
  readOnly = false,
}: {
  workspaceName: string;
  paths: string[];
  activePath: string | null;
  dirty: Set<string>;
  expanded: Set<string>;
  onToggleFolder: (path: string) => void;
  onCollapseAll: () => void;
  onOpenFile: (path: string) => void;
  /** Resolves to an error message, or null once the file exists. */
  onCreateFile: (path: string) => string | null | Promise<string | null>;
  peers: WorkspacePeer[];
  /** View-only members can't create files. */
  readOnly?: boolean;
}) {
  const tree = useMemo(() => buildTree(paths), [paths]);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pendingCreate, setPendingCreate] = useState(false);

  const peersByFile = useMemo(() => {
    const map = new Map<string, WorkspacePeer[]>();
    for (const p of peers) {
      if (!p.file) continue;
      map.set(p.file, [...(map.get(p.file) ?? []), p]);
    }
    return map;
  }, [peers]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (pendingCreate) return;
    const path = draft.trim();
    if (!VALID_PATH.test(path)) {
      setError("Use letters, numbers, dots, dashes and / for folders.");
      return;
    }
    setPendingCreate(true);
    let err: string | null;
    try {
      err = await onCreateFile(path);
    } catch {
      err = "Couldn't reach the server. Try again.";
    } finally {
      setPendingCreate(false);
    }
    if (err) {
      setError(err);
      return;
    }
    setCreating(false);
    setDraft("");
    setError(null);
  }

  function renderNode(node: TreeNode, depth: number) {
    const indent = { paddingLeft: 10 + depth * 14 };
    if (node.children) {
      const open = expanded.has(node.path);
      return (
        <li key={node.path} role="treeitem" aria-expanded={open} aria-selected={false}>
          <button
            type="button"
            onClick={() => onToggleFolder(node.path)}
            style={indent}
            className="mx-1.5 flex h-[26px] w-[calc(100%-12px)] items-center gap-1.5 rounded-[6px] pr-2 text-left text-[13px] text-fg-muted transition-colors duration-100 hover:bg-hover hover:text-fg focus-visible:outline-offset-[-2px]"
          >
            <ChevronRight
              className={cn("h-3.5 w-3.5 shrink-0 text-fg-faint transition-transform duration-200", open && "rotate-90")}
            />
            {open ? (
              <FolderOpen className="h-[15px] w-[15px] shrink-0 text-fg-subtle" strokeWidth={1.75} />
            ) : (
              <Folder className="h-[15px] w-[15px] shrink-0 text-fg-subtle" strokeWidth={1.75} />
            )}
            <span className="truncate">{node.name}</span>
          </button>
          {open && (
            <ul role="group" className="relative">
              <span
                aria-hidden="true"
                className="absolute bottom-0 top-0 w-px bg-line-strong/70"
                style={{ left: 23 + depth * 14 }}
              />
              {node.children.map((c) => renderNode(c, depth + 1))}
            </ul>
          )}
        </li>
      );
    }

    const active = node.path === activePath;
    const here = peersByFile.get(node.path) ?? [];
    return (
      <li key={node.path} role="treeitem" aria-selected={active}>
        <button
          type="button"
          onClick={() => onOpenFile(node.path)}
          style={{ paddingLeft: 10 + depth * 14 + 20 }}
          title={node.path}
          className={cn(
            "mx-1.5 flex h-[26px] w-[calc(100%-12px)] items-center gap-1.5 rounded-[6px] pr-2.5 text-left text-[13px] transition-colors duration-100 focus-visible:outline-offset-[-2px]",
            active ? "bg-accent-soft font-medium text-fg" : "text-fg-muted hover:bg-hover hover:text-fg",
          )}
        >
          <FileIcon path={node.path} className="h-3.5 w-3.5" />
          <span className="min-w-0 flex-1 truncate">{node.name}</span>
          {here.length > 0 && (
            <span className="flex -space-x-0.5" aria-label={`${here.map((p) => p.name).join(", ")} here`}>
              {here.map((p) => (
                <span key={p.id} className={cn("h-[7px] w-[7px] rounded-full ring-[1.5px] ring-sunken", peerBg[p.color])} />
              ))}
            </span>
          )}
          {dirty.has(node.path) && (
            <span className="h-[7px] w-[7px] rounded-full bg-fg-muted" aria-label="Unsaved changes" />
          )}
        </button>
      </li>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 items-center justify-between pl-4 pr-2">
        <span className="font-mono text-[10.5px] uppercase tracking-[0.14em] text-fg-subtle">Explorer</span>
        <div className="flex items-center">
          <IconButton
            label="New file"
            size="sm"
            disabled={readOnly}
            onClick={() => {
              setCreating(true);
              setError(null);
            }}
          >
            <FilePlus className="h-3.5 w-3.5" />
          </IconButton>
          <IconButton label="Collapse folders" size="sm" onClick={onCollapseAll}>
            <ChevronsDownUp className="h-3.5 w-3.5" />
          </IconButton>
        </div>
      </div>
      <p className="px-4 pb-2 text-[12.5px] font-semibold text-fg">{workspaceName}</p>

      {creating && (
        <form onSubmit={submit} className="px-2 pb-2">
          <input
            autoFocus
            value={draft}
            onChange={(e) => {
              setDraft(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                setCreating(false);
                setDraft("");
                setError(null);
              }
            }}
            onBlur={() => {
              if (!draft.trim()) setCreating(false);
            }}
            placeholder="src/lib/new-file.ts"
            aria-label="New file path"
            readOnly={pendingCreate}
            aria-busy={pendingCreate}
            spellCheck={false}
            className={cn(
              "h-7 w-full rounded-[6px] border bg-panel px-2 font-mono text-[12px] text-fg outline-none placeholder:text-fg-faint focus:shadow-[0_0_0_3px_rgb(38_115_77/0.12)]",
              error ? "border-danger/60" : "border-accent/50",
            )}
          />
          {error ? (
            <p className="mt-1 px-0.5 text-[11px] text-danger">{error}</p>
          ) : (
            <p className="mt-1 px-0.5 text-[11px] text-fg-subtle">Enter to create · Esc to cancel</p>
          )}
        </form>
      )}

      <ul role="tree" aria-label="Files" className="min-h-0 flex-1 overflow-y-auto pb-4">
        {tree.map((n) => renderNode(n, 0))}
      </ul>
    </div>
  );
}
