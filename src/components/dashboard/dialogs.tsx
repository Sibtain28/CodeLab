"use client";

import { ArrowRight, Globe, Lock, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Modal, ModalActions, inputClasses } from "@/components/ui/modal";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { languageMeta, type Language } from "@/lib/mock/projects";
import { LanguageGlyph } from "./project-card";

const languages = Object.keys(languageMeta) as Language[];

const frameworks: Record<Language, string> = {
  TypeScript: "Next.js",
  JavaScript: "Node.js",
  Python: "FastAPI",
  Go: "net/http",
  Rust: "Axum",
};

export interface NewProjectInput {
  name: string;
  description: string;
  language: Language;
  framework: string;
  visibility: "private" | "team" | "public";
}

const NAME_PATTERN = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;

export function CreateProjectDialog({
  open,
  onClose,
  onCreate,
  existingNames,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
  existingNames: string[];
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a project"
      description="Projects created in Phase 1 live in this browser tab only — nothing is saved yet."
    >
      <CreateProjectForm onClose={onClose} onCreate={onCreate} existingNames={existingNames} />
    </Modal>
  );
}

function CreateProjectForm({
  onClose,
  onCreate,
  existingNames,
}: {
  onClose: () => void;
  onCreate: (input: NewProjectInput) => void;
  existingNames: string[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<Language>("TypeScript");
  const [visibility, setVisibility] = useState<NewProjectInput["visibility"]>("team");
  const [touched, setTouched] = useState(false);

  const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
  const error = !slug
    ? "Give your project a name."
    : !NAME_PATTERN.test(slug)
      ? "Use 3–40 lowercase letters, numbers or dashes."
      : existingNames.includes(slug)
        ? "A project with this name already exists."
        : null;

  function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (error) return;
    onCreate({
      name: slug,
      description: description.trim() || "A fresh CodeLab project.",
      language,
      framework: frameworks[language],
      visibility,
    });
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field
        label="Project name"
        htmlFor="project-name"
        error={touched ? error : null}
        hint={slug ? <span className="font-mono">{slug}</span> : "Lowercase, dashes allowed."}
      >
        <input
          id="project-name"
          data-autofocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          placeholder="realtime-notes"
          autoComplete="off"
          spellCheck={false}
          className={cn(inputClasses, "font-mono")}
        />
      </Field>

      <Field label="Description" htmlFor="project-description" hint="Optional">
        <input
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What are you building?"
          className={inputClasses}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-medium text-fg-muted">Language</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {languages.map((lang) => (
            <label
              key={lang}
              className={cn(
                "flex cursor-pointer flex-col items-center gap-1.5 rounded-[9px] border px-2 py-3 text-[11.5px] transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                language === lang
                  ? "border-accent/50 bg-accent-soft text-fg"
                  : "border-line-strong text-fg-subtle hover:border-fg-faint hover:text-fg-muted",
              )}
            >
              <input
                type="radio"
                name="language"
                value={lang}
                checked={language === lang}
                onChange={() => setLanguage(lang)}
                className="sr-only"
              />
              <LanguageGlyph language={lang} size="sm" />
              {lang}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-medium text-fg-muted">Visibility</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(
            [
              { id: "private", label: "Private", icon: Lock, hint: "Only you" },
              { id: "team", label: "Team", icon: Users, hint: "Invited members" },
              { id: "public", label: "Public", icon: Globe, hint: "Anyone with link" },
            ] as const
          ).map((opt) => (
            <label
              key={opt.id}
              className={cn(
                "flex cursor-pointer items-center gap-2.5 rounded-[9px] border px-3 py-2.5 transition-colors duration-150 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-accent/40",
                visibility === opt.id
                  ? "border-accent/50 bg-accent-soft"
                  : "border-line-strong hover:border-fg-faint",
              )}
            >
              <input
                type="radio"
                name="visibility"
                value={opt.id}
                checked={visibility === opt.id}
                onChange={() => setVisibility(opt.id)}
                className="sr-only"
              />
              <opt.icon
                className={cn("h-4 w-4", visibility === opt.id ? "text-accent" : "text-fg-subtle")}
              />
              <span className="leading-tight">
                <span className="block text-[13px] text-fg">{opt.label}</span>
                <span className="block text-[11px] text-fg-subtle">{opt.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <ModalActions>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          Create project
        </Button>
      </ModalActions>
    </form>
  );
}

/** Pulls a workspace id out of a pasted invite link or raw code. */
function parseWorkspaceCode(value: string): string {
  const trimmed = value.trim();
  const match = /workspace\/([\w-]+)/.exec(trimmed);
  return (match ? match[1] : trimmed).toLowerCase();
}

export function JoinWorkspaceDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Join a workspace"
      description="Paste an invite link or enter a workspace code."
      width="md"
    >
      <JoinWorkspaceForm onClose={onClose} />
    </Modal>
  );
}

function JoinWorkspaceForm({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: FormEvent) {
    e.preventDefault();
    const code = parseWorkspaceCode(value);
    if (!code) {
      setError("Enter an invite link or code.");
      return;
    }
    // Phase 1: only the mock demo workspace exists.
    if (code !== "demo") {
      setError(`No workspace found for “${code}”. Only the demo workspace exists in this preview.`);
      return;
    }
    onClose();
    router.push("/workspace/demo");
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Invite link or code" htmlFor="join-code" error={error}>
        <input
          id="join-code"
          data-autofocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="/workspace/demo or demo"
          autoComplete="off"
          spellCheck={false}
          className={cn(inputClasses, "font-mono", error && "border-danger/60")}
        />
      </Field>
      <button
        type="button"
        onClick={() => {
          setValue("demo");
          setError(null);
        }}
        className="flex w-full items-center justify-between rounded-[9px] border border-dashed border-line-strong px-3 py-2.5 text-left text-[12.5px] text-fg-subtle transition-colors hover:border-accent/50 hover:bg-accent-soft/50 hover:text-fg-muted"
      >
        <span>
          Try the demo code <span className="font-mono text-accent">demo</span>
        </span>
        <Kbd>Fill</Kbd>
      </button>
      <ModalActions>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm">
          Join workspace <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </ModalActions>
    </form>
  );
}

const shortcutGroups: { title: string; items: { keys: string[]; label: string }[] }[] = [
  {
    title: "Dashboard",
    items: [{ keys: ["⌘", "K"], label: "Search projects" }],
  },
  {
    title: "Workspace",
    items: [
      { keys: ["⌘", "B"], label: "Toggle file explorer" },
      { keys: ["⌘", "J"], label: "Toggle bottom panel" },
      { keys: ["⌘", "⇧", "K"], label: "Toggle collaboration panel" },
      { keys: ["⌘", "↵"], label: "Run project" },
      { keys: ["⌘", "S"], label: "Save file (this session)" },
    ],
  },
];

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description="Use Ctrl instead of ⌘ on Windows and Linux."
      width="md"
    >
      <div className="space-y-5">
        {shortcutGroups.map((g) => (
          <div key={g.title}>
            <p className="mb-2 font-mono text-[10.5px] uppercase tracking-[0.12em] text-fg-subtle">
              {g.title}
            </p>
            <ul className="divide-y divide-line rounded-[10px] border border-line">
              {g.items.map((item) => (
                <li
                  key={item.label}
                  className="flex items-center justify-between px-3 py-2.5 text-[13px] text-fg-muted"
                >
                  {item.label}
                  <span className="flex gap-1">
                    {item.keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Modal>
  );
}
