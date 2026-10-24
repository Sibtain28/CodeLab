"use client";

import { Check, Copy, Link2, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal, inputClasses } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import type { WorkspaceMe, WorkspacePeer } from "@/lib/mock/workspace";
import { createInvite, listInvites, revokeInvite, type InviteSummary } from "@/server/actions/invites";

/**
 * Real invites for saved projects: the owner creates expiring invite links
 * (Editor or Viewer) and can revoke them. Everything is checked on the server.
 */
export function ProjectInviteDialog({
  open,
  onClose,
  projectId,
  projectName,
  me,
  members,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  projectName: string;
  me: WorkspaceMe;
  members: WorkspacePeer[];
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Invite to ${projectName}`}
      description="Share an invite link. Anyone who opens it while signed in can join with the role you choose."
    >
      <InviteBody projectId={projectId} me={me} members={members} />
    </Modal>
  );
}

function InviteBody({ projectId, me, members }: { projectId: string; me: WorkspaceMe; members: WorkspacePeer[] }) {
  const isOwner = me.role === "Owner";
  const [role, setRole] = useState<"EDITOR" | "VIEWER">("EDITOR");
  const [invites, setInvites] = useState<InviteSummary[] | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Rendered only while the dialog is open, so this runs once per opening.
  useEffect(() => {
    if (!isOwner) return;
    let cancelled = false;
    listInvites(projectId)
      .then((r) => {
        if (cancelled) return;
        if (r.ok) setInvites(r.invites);
        else setError(r.error);
      })
      .catch(() => !cancelled && setError("Couldn't load invite links."));
    return () => {
      cancelled = true;
    };
  }, [isOwner, projectId]);

  async function create() {
    setBusy("create");
    setError(null);
    try {
      const r = await createInvite({ projectId, role });
      if (!r.ok) return setError(r.error);
      setLink(`${window.location.origin}${r.path}`);
      setInvites(r.invites);
      setCopied(false);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function revoke(id: string) {
    setBusy(id);
    setError(null);
    try {
      const r = await revokeInvite({ projectId, inviteId: id });
      if (!r.ok) return setError(r.error);
      setInvites(r.invites);
    } catch {
      setError("Couldn't reach the server. Try again.");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError("Couldn't copy automatically — select the link and copy it.");
    }
  }

  return (
    <div className="space-y-5">
      {isOwner ? (
        <section aria-label="Create invite link">
          <p className="mb-1.5 text-[12.5px] font-medium text-fg-muted">New invite link</p>
          <div className="flex gap-2">
            <div className="flex flex-1 rounded-[8px] bg-raised p-0.5" role="radiogroup" aria-label="Role for people who join">
              {(
                [
                  { id: "EDITOR", label: "Editor", hint: "Can edit and save" },
                  { id: "VIEWER", label: "Viewer", hint: "Read only" },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  role="radio"
                  aria-checked={role === opt.id}
                  onClick={() => setRole(opt.id)}
                  className={cn(
                    "flex-1 rounded-[6px] px-2 py-1 text-left leading-tight transition-[background-color,box-shadow] duration-150",
                    role === opt.id ? "bg-panel shadow-card" : "hover:bg-hover/60",
                  )}
                >
                  <span className="block text-[12.5px] text-fg">{opt.label}</span>
                  <span className="block text-[11px] text-fg-subtle">{opt.hint}</span>
                </button>
              ))}
            </div>
            <Button variant="primary" onClick={create} disabled={busy === "create"} className="h-auto self-stretch">
              {busy === "create" ? <LoaderCircle className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
              Create link
            </Button>
          </div>

          {link && (
            <div className="mt-3 animate-rise rounded-[10px] border border-accent/30 bg-accent-soft/60 p-3">
              <div className="flex gap-2">
                <input
                  readOnly
                  value={link}
                  aria-label="Invite link"
                  onFocus={(e) => e.currentTarget.select()}
                  className={cn(inputClasses, "min-w-0 flex-1 font-mono text-[12px]")}
                />
                <Button onClick={copy} className="w-24">
                  {copied ? <Check className="h-3.5 w-3.5 animate-check text-accent" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <p className="mt-2 text-[11.5px] leading-4 text-fg-subtle">
                Copy it now — for security, links can&apos;t be shown again. Expires in 7 days.
              </p>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-2 text-[12px] text-danger">
              {error}
            </p>
          )}

          <div className="mt-4">
            <p className="mb-1.5 text-[12.5px] font-medium text-fg-muted">Active links</p>
            {invites === null ? (
              <div className="h-10 animate-pulse rounded-[10px] bg-raised" aria-label="Loading invite links" />
            ) : invites.length === 0 ? (
              <p className="rounded-[10px] border border-dashed border-line-strong px-3 py-2.5 text-[12.5px] text-fg-subtle">
                No active links.
              </p>
            ) : (
              <ul className="divide-y divide-line rounded-[10px] border border-line">
                {invites.map((i) => (
                  <li key={i.id} className="flex items-center gap-3 px-3 py-2 text-[12.5px]">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-fg-subtle" />
                    <span className="min-w-0 flex-1 truncate text-fg-muted">
                      <span className="text-fg">{i.role}</span> link · expires {i.expires} · {i.uses} joined
                    </span>
                    <Button size="xs" variant="ghost" onClick={() => revoke(i.id)} disabled={busy === i.id}>
                      {busy === i.id ? "Revoking…" : "Revoke"}
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : (
        <p className="rounded-[10px] bg-raised px-3 py-2.5 text-[12.5px] leading-5 text-fg-subtle">
          Only the project owner can create invite links. Ask them to send you one for your teammate.
        </p>
      )}

      <div>
        <p className="mb-1.5 text-[12.5px] font-medium text-fg-muted">People with access</p>
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          <li className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={me.name} color={me.color} size="sm" />
            <span className="flex-1 text-[13px] text-fg">{me.name} (you)</span>
            <span className="text-[12px] text-fg-subtle">{me.role}</span>
          </li>
          {members.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={p.name} color={p.color} size="sm" />
              <span className="flex-1 text-[13px] text-fg">{p.name}</span>
              <span className="text-[12px] text-fg-subtle">{p.role}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
