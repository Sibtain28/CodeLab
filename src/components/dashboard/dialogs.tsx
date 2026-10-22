"use client";

import { ArrowRight, Globe, LoaderCircle, Lock, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Modal, ModalActions, inputClasses } from "@/components/ui/modal";
import { Kbd } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import {
  LANGUAGES,
  PROJECT_DESCRIPTION_MAX,
  PROJECT_NAME_PATTERN,
  slugifyProjectName,
  type Language,
  type Visibility,
} from "@/lib/projects";
import { LanguageGlyph } from "./project-card";

export interface NewProjectInput {
  name: string;
  description: string;
  language: Language;
  visibility: Visibility;
}

/** Resolves with an error to show, or nothing on success. */
export type CreateProjectHandler = (
  input: NewProjectInput,
) => Promise<{ error: string; field?: string } | void>;

export function CreateProjectDialog({
  open,
  onClose,
  onCreate,
  existingNames,
}: {
  open: boolean;
  onClose: () => void;
  onCreate: CreateProjectHandler;
  existingNames: string[];
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Create a project"
      description="Projects are saved to your account and start with a few starter files."
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
  onCreate: CreateProjectHandler;
  existingNames: string[];
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState<Language>("TypeScript");
  const [visibility, setVisibility] = useState<Visibility>("private");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [serverError, setServerError] = useState<{ error: string; field?: string } | null>(null);

  const slug = slugifyProjectName(name);
  const nameError = !slug
    ? "Give your project a name."
    : !PROJECT_NAME_PATTERN.test(slug)
      ? "Use 3–40 lowercase letters, numbers or dashes."
      : existingNames.includes(slug)
        ? "You already have a project with this name."
        : null;
  const descriptionError =
    description.trim().length > PROJECT_DESCRIPTION_MAX ? `Use ${PROJECT_DESCRIPTION_MAX} characters or fewer.` : null;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setTouched(true);
    if (nameError || descriptionError || pending) return;
    setPending(true);
    setServerError(null);
    try {
      const result = await onCreate({ name: slug, description: description.trim(), language, visibility });
      if (result) setServerError(result);
    } catch {
      setServerError({ error: "Couldn't reach the server. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-5">
      <Field
        label="Project name"
        htmlFor="project-name"
        error={touched ? (nameError ?? (serverError?.field === "name" ? serverError.error : null)) : null}
        hint={slug ? <span className="font-mono">{slug}</span> : "Lowercase, dashes allowed."}
      >
        <input
          id="project-name"
          data-autofocus
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (serverError?.field === "name") setServerError(null);
          }}
          onBlur={() => setTouched(true)}
          placeholder="realtime-notes"
          autoComplete="off"
          spellCheck={false}
          className={cn(inputClasses, "font-mono")}
        />
      </Field>

      <Field label="Description" htmlFor="project-description" hint="Optional" error={descriptionError}>
        <input
          id="project-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What are you building?"
          maxLength={PROJECT_DESCRIPTION_MAX + 20}
          className={inputClasses}
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 text-[12.5px] font-medium text-fg-muted">Language</legend>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {LANGUAGES.map((lang) => (
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
              { id: "team", label: "Team", icon: Users, hint: "Members you add" },
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
        <p className="mt-2 text-[12px] leading-[17px] text-fg-subtle">
          Saved with the project. For now every project is members-only — sharing and public links
          arrive in a later phase.
        </p>
      </fieldset>

      {serverError && serverError.field !== "name" && (
        <p role="alert" className="text-[12.5px] text-danger">
          {serverError.error}
        </p>
      )}

      <ModalActions>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" size="sm" disabled={pending}>
          {pending && <LoaderCircle className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Creating…" : "Create project"}
        </Button>
      </ModalActions>
    </form>
  );
}

/** Pulls a workspace id out of a pasted workspace link or raw id. */
function parseWorkspaceCode(value: string): string {
  const trimmed = value.trim();
  const match = /workspace\/([\w-]+)/.exec(trimmed);
  return match ? match[1] : trimmed;
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
      description="Paste a workspace link or id. You can open workspaces you’re a member of."
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
      setError("Enter a workspace link or id.");
      return;
    }
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(code)) {
      setError("That doesn’t look like a workspace link or id.");
      return;
    }
    // Access is checked on the server; non-members see “not found”.
    onClose();
    router.push(`/workspace/${code}`);
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-4">
      <Field label="Workspace link or id" htmlFor="join-code" error={error}>
        <input
          id="join-code"
          data-autofocus
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          placeholder="https://…/workspace/… or an id"
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
          Try the sample workspace <span className="font-mono text-accent">demo</span>
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
      { keys: ["⌘", "S"], label: "Save file" },
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
