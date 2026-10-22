"use client";

import { Check, Copy, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import { Avatar } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Modal, inputClasses } from "@/components/ui/modal";
import { Badge } from "@/components/ui/primitives";
import { cn } from "@/lib/cn";
import { currentUser } from "@/lib/mock/people";
import type { WorkspacePeer } from "@/lib/mock/workspace";

export interface PendingInvite {
  email: string;
  role: "Editor" | "Viewer";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function InviteDialog({
  open,
  onClose,
  linkPath,
  onCopyLink,
  peers,
  invites,
  onAddInvite,
  onRemoveInvite,
}: {
  open: boolean;
  onClose: () => void;
  linkPath: string;
  onCopyLink: () => Promise<boolean>;
  peers: WorkspacePeer[];
  invites: PendingInvite[];
  onAddInvite: (invite: PendingInvite) => void;
  onRemoveInvite: (email: string) => void;
}) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Invite to orbit-dashboard"
      description="Invites are recorded in this tab only — emails are not sent in Phase 1."
    >
      <InviteBody
        linkPath={linkPath}
        onCopyLink={onCopyLink}
        peers={peers}
        invites={invites}
        onAddInvite={onAddInvite}
        onRemoveInvite={onRemoveInvite}
      />
    </Modal>
  );
}

function InviteBody({
  linkPath,
  onCopyLink,
  peers,
  invites,
  onAddInvite,
  onRemoveInvite,
}: {
  linkPath: string;
  onCopyLink: () => Promise<boolean>;
  peers: WorkspacePeer[];
  invites: PendingInvite[];
  onAddInvite: (invite: PendingInvite) => void;
  onRemoveInvite: (email: string) => void;
}) {
  // Only rendered after the dialog opens on the client, so window is available.
  const link = `${window.location.origin}${linkPath}`;
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<PendingInvite["role"]>("Editor");
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  function submit(e: FormEvent) {
    e.preventDefault();
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) return setError("Enter a valid email address.");
    if (invites.some((i) => i.email === value)) return setError("That person is already invited.");
    onAddInvite({ email: value, role });
    setEmail("");
    setError(null);
  }

  return (
    <div className="space-y-5">
      <form onSubmit={submit} noValidate>
        <label htmlFor="invite-email" className="mb-1.5 block text-[12.5px] font-medium text-fg-muted">
          Invite by email
        </label>
        <div className="flex gap-2">
          <input
            id="invite-email"
            type="email"
            data-autofocus
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
            placeholder="teammate@company.com"
            className={cn(inputClasses, "min-w-0 flex-1", error && "border-danger/60")}
          />
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as PendingInvite["role"])}
            aria-label="Role"
            className="h-9 rounded-[7px] border border-line-strong bg-panel px-2 text-[13px] text-fg outline-none focus:border-accent/60"
          >
            <option>Editor</option>
            <option>Viewer</option>
          </select>
          <Button type="submit" variant="primary" size="md">
            Add
          </Button>
        </div>
        {error && (
          <p role="alert" className="mt-1.5 text-xs text-danger">
            {error}
          </p>
        )}
      </form>

      <div>
        <p className="mb-1.5 text-[12.5px] font-medium text-fg-muted">Invite link</p>
        <div className="flex gap-2">
          <input
            readOnly
            value={link}
            aria-label="Invite link"
            onFocus={(e) => e.currentTarget.select()}
            className={cn(inputClasses, "min-w-0 flex-1 font-mono text-[12px] text-fg-muted")}
          />
          <Button
            onClick={async () => {
              const ok = await onCopyLink();
              if (ok) {
                setCopied(true);
                window.setTimeout(() => setCopied(false), 1800);
              }
            }}
            className="w-24"
          >
            {copied ? <Check className="h-3.5 w-3.5 animate-check text-accent" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>

      <div>
        <p className="mb-2 text-[12.5px] font-medium text-fg-muted">People with access</p>
        <ul className="divide-y divide-line rounded-[10px] border border-line">
          <li className="flex items-center gap-3 px-3 py-2.5">
            <Avatar name={currentUser.name} color={currentUser.color} size="sm" />
            <span className="flex-1 text-[13px] text-fg">{currentUser.name} (you)</span>
            <span className="text-[12px] text-fg-subtle">Owner</span>
          </li>
          {peers.map((p) => (
            <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
              <Avatar name={p.name} color={p.color} size="sm" />
              <span className="flex-1 text-[13px] text-fg">{p.name}</span>
              <span className="text-[12px] text-fg-subtle">{p.role}</span>
            </li>
          ))}
          {invites.map((i) => (
            <li key={i.email} className="flex animate-rise items-center gap-3 px-3 py-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-dashed border-line-strong text-[10px] text-fg-subtle">
                @
              </span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12.5px] text-fg-muted">{i.email}</span>
              <Badge tone="warning">Pending · not sent</Badge>
              <span className="text-[12px] text-fg-subtle">{i.role}</span>
              <button
                type="button"
                aria-label={`Remove ${i.email}`}
                onClick={() => onRemoveInvite(i.email)}
                className="rounded p-0.5 text-fg-faint hover:text-fg"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
