import { redirect } from "next/navigation";
import { connection } from "next/server";
import { Suspense } from "react";
import { missingConfig } from "@/server/config";
import { getCurrentUser } from "@/server/dal";
import { AuthForm } from "./auth-form";
import { SetupRequired } from "./setup-required";

function safeNext(value: string | string[] | undefined) {
  return typeof value === "string" && /^\/(dashboard|workspace\/[A-Za-z0-9_-]+)$/.test(value) ? value : undefined;
}

/** Request-time part of the login/sign-up pages. */
async function AuthGate({
  mode,
  searchParams,
}: {
  mode: "sign-in" | "sign-up";
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await connection();
  const next = safeNext((await searchParams).next);
  const missing = missingConfig();
  if (missing.length) {
    return (
      <div className="space-y-5">
        <SetupRequired missing={missing} />
        <AuthForm mode={mode} next={next} disabled />
      </div>
    );
  }
  // Already signed in (verified against the database): skip the form.
  if (await getCurrentUser()) redirect(next ?? "/dashboard");
  return <AuthForm mode={mode} next={next} />;
}

function FormSkeleton({ fields }: { fields: number }) {
  return (
    <div aria-hidden="true" className="space-y-4">
      {Array.from({ length: fields }, (_, i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-3.5 w-16 rounded bg-raised" />
          <div className="h-10 rounded-[7px] bg-raised" />
        </div>
      ))}
      <div className="h-11 rounded-[7px] bg-raised" />
    </div>
  );
}

export function AuthPage({
  mode,
  searchParams,
}: {
  mode: "sign-in" | "sign-up";
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const isSignUp = mode === "sign-up";
  return (
    <div className="rounded-2xl bg-panel p-6 shadow-card sm:p-8">
      <h1 className="font-display text-[34px] leading-[1.05] tracking-[-0.02em]">
        {isSignUp ? "Create your account" : "Welcome back"}
      </h1>
      <p className="mb-7 mt-2 text-[14px] text-fg-subtle">
        {isSignUp ? "Your projects are saved to your account." : "Sign in to open your projects."}
      </p>
      <Suspense fallback={<FormSkeleton fields={isSignUp ? 3 : 2} />}>
        <AuthGate mode={mode} searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
