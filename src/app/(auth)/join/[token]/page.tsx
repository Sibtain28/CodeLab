import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { SetupRequired } from "@/components/auth/setup-required";
import { AcceptInviteForm } from "@/components/invites/accept-invite-form";
import { ButtonLink } from "@/components/ui/button";
import { missingConfig } from "@/server/config";
import { requireUser } from "@/server/dal";
import { previewInvite } from "@/server/invites";

export const metadata: Metadata = { title: "Join project" };

async function Invite({ params }: { params: Promise<{ token: string }> }) {
  await connection();
  const missing = missingConfig();
  if (missing.length) return <SetupRequired missing={missing} />;
  const { token } = await params;
  // Signed-out visitors go to login and come straight back here.
  const user = await requireUser(`/join/${token}`);
  const invite = await previewInvite(token, user.id);

  if (invite.status === "invalid") {
    return (
      <>
        <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.02em]">Invite not valid</h1>
        <p className="mb-7 mt-2 text-[14px] leading-6 text-fg-subtle">
          This invite link has expired, was revoked, or was copied incompletely. Ask the project owner for a new
          link.
        </p>
        <ButtonLink href="/dashboard" variant="secondary" className="w-full">
          Back to dashboard
        </ButtonLink>
      </>
    );
  }

  return (
    <>
      <p className="font-mono text-[11px] uppercase tracking-[0.12em] text-fg-subtle">Project invite</p>
      <h1 className="mt-2 font-display text-[34px] leading-[1.05] tracking-[-0.02em]">
        Join <span className="font-mono text-[28px]">{invite.projectName}</span>
      </h1>
      <dl className="mb-7 mt-5 divide-y divide-line rounded-[10px] border border-line text-[13px]">
        <div className="flex justify-between px-3 py-2.5">
          <dt className="text-fg-subtle">Owner</dt>
          <dd className="text-fg">{invite.ownerName}</dd>
        </div>
        <div className="flex justify-between px-3 py-2.5">
          <dt className="text-fg-subtle">Your access</dt>
          <dd className="text-fg">{invite.role === "Viewer" ? "Viewer — can read and follow along" : "Editor — can edit and save"}</dd>
        </div>
        <div className="flex justify-between px-3 py-2.5">
          <dt className="text-fg-subtle">Link expires</dt>
          <dd className="text-fg">{invite.expires}</dd>
        </div>
      </dl>
      {invite.status === "member" ? (
        <>
          <p className="mb-3 text-[13px] text-fg-muted">You&apos;re already a member of this project.</p>
          <ButtonLink href={`/workspace/${invite.projectId}`} variant="primary" size="lg" className="w-full">
            Open workspace
          </ButtonLink>
        </>
      ) : (
        <AcceptInviteForm token={token} projectName={invite.projectName!} />
      )}
      <p className="mt-4 text-center text-[12px] text-fg-subtle">Signed in as {user.email}</p>
    </>
  );
}

export default function JoinPage({ params }: PageProps<"/join/[token]">) {
  return (
    <div className="rounded-2xl bg-panel p-6 shadow-card sm:p-8">
      <Suspense
        fallback={
          <div aria-hidden="true" className="space-y-4">
            <div className="h-8 w-48 rounded bg-raised" />
            <div className="h-28 rounded-[10px] bg-raised/70" />
            <div className="h-11 rounded-[7px] bg-raised" />
          </div>
        }
      >
        <Invite params={params} />
      </Suspense>
    </div>
  );
}
