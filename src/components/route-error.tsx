"use client";

import { RotateCw } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { Button, ButtonLink } from "@/components/ui/button";

/** Shared error boundary UI for private routes (e.g. the database is unreachable). */
export function RouteError({ retry, what }: { retry: () => void; what: string }) {
  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center px-5 sm:px-8">
        <Logo />
      </div>
      <div className="mx-auto w-full max-w-[460px] px-5 py-20">
        <p className="font-mono text-[12.5px] text-fg-subtle">Something went wrong</p>
        <h1 className="mt-3 font-display text-[40px] leading-[1.05] tracking-[-0.02em]">Couldn&apos;t load {what}.</h1>
        <p className="mt-4 text-[14.5px] leading-6 text-fg-muted">
          The server or database didn&apos;t respond. Nothing you saved is lost — try again in a moment.
        </p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Button variant="primary" onClick={retry}>
            <RotateCw className="h-4 w-4" /> Try again
          </Button>
          <ButtonLink href="/" variant="secondary">
            Go home
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
