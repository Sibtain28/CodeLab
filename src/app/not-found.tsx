import { ArrowLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

export default function NotFound() {
  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center px-5 sm:px-8">
        <Logo />
      </div>
      <div className="flex flex-1 items-center py-20">
        <div className="mx-auto w-full max-w-[1200px] animate-rise px-5 sm:px-8">
          <p className="font-mono text-[12.5px] text-fg-subtle">404 · not found</p>
          <h1 className="mt-4 max-w-[14ch] font-display text-[clamp(2.8rem,7vw,5rem)] leading-[0.98] tracking-[-0.02em]">
            Nothing to compile here.
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-7 text-fg-muted">
            This page or workspace doesn&apos;t exist, or you don&apos;t have access to it. Ask the
            project owner to add you.
          </p>
          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <ButtonLink href="/dashboard" variant="primary">
              <ArrowLeft className="h-4 w-4" /> Back to dashboard
            </ButtonLink>
            <ButtonLink href="/workspace/demo" variant="secondary">
              Open demo workspace
            </ButtonLink>
          </div>
        </div>
      </div>
    </main>
  );
}
