import { SetupRequired } from "@/components/auth/setup-required";
import { Logo } from "@/components/brand/logo";
import { ButtonLink } from "@/components/ui/button";

/** Full-page notice for private routes when the environment isn't configured. */
export function SetupScreen({ missing }: { missing: string[] }) {
  return (
    <main className="flex flex-1 flex-col">
      <div className="mx-auto flex h-14 w-full max-w-[1200px] items-center px-5 sm:px-8">
        <Logo />
      </div>
      <div className="mx-auto w-full max-w-[460px] px-4 py-16">
        <SetupRequired missing={missing} />
        <div className="mt-5">
          <ButtonLink href="/workspace/demo" variant="secondary" size="sm">
            Open the sample demo workspace
          </ButtonLink>
        </div>
      </div>
    </main>
  );
}
