"use client";

import { LoaderCircle } from "lucide-react";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { acceptInvite, type AcceptInviteState } from "@/server/actions/invites";

export function AcceptInviteForm({ token, projectName }: { token: string; projectName: string }) {
  const [state, action, pending] = useActionState<AcceptInviteState | null, FormData>(acceptInvite, null);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="token" value={token} />
      {state?.error && (
        <p role="alert" className="rounded-[8px] bg-danger/[0.06] px-3 py-2.5 text-[13px] leading-5 text-danger ring-1 ring-inset ring-danger/20">
          {state.error}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending}>
        {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {pending ? "Joining…" : `Join ${projectName}`}
      </Button>
    </form>
  );
}
