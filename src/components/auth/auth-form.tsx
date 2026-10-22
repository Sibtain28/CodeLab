"use client";

import { Eye, EyeOff, LoaderCircle } from "lucide-react";
import Link from "next/link";
import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClasses } from "@/components/ui/modal";
import { cn } from "@/lib/cn";
import { signIn, signUp, type AuthFormState } from "@/server/actions/auth";

export function AuthForm({
  mode,
  next,
  disabled = false,
}: {
  mode: "sign-in" | "sign-up";
  next?: string;
  disabled?: boolean;
}) {
  const [state, action, pending] = useActionState<AuthFormState | null, FormData>(
    mode === "sign-in" ? signIn : signUp,
    null,
  );
  const [showPassword, setShowPassword] = useState(false);
  const errors = state?.fieldErrors ?? {};
  const isSignUp = mode === "sign-up";
  const query = next ? `?next=${encodeURIComponent(next)}` : "";

  return (
    <form action={action} noValidate className="space-y-4" aria-describedby={state?.error ? "auth-error" : undefined}>
      {next && <input type="hidden" name="next" value={next} />}

      {state?.error && (
        <p id="auth-error" role="alert" className="rounded-[8px] bg-danger/[0.06] px-3 py-2.5 text-[13px] leading-5 text-danger ring-1 ring-inset ring-danger/20">
          {state.error}
        </p>
      )}

      {isSignUp && (
        <Field label="Name" htmlFor="name" error={errors.name}>
          <input
            id="name"
            name="name"
            autoComplete="name"
            required
            maxLength={80}
            defaultValue={state?.values?.name}
            aria-invalid={!!errors.name}
            className={cn(inputClasses, "h-10", errors.name && "border-danger/60")}
          />
        </Field>
      )}

      <Field label="Email" htmlFor="email" error={errors.email}>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          required
          maxLength={254}
          defaultValue={state?.values?.email}
          aria-invalid={!!errors.email}
          className={cn(inputClasses, "h-10", errors.email && "border-danger/60")}
        />
      </Field>

      <Field
        label="Password"
        htmlFor="password"
        error={errors.password}
        hint={isSignUp ? "At least 8 characters." : undefined}
      >
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            required
            minLength={isSignUp ? 8 : undefined}
            maxLength={128}
            aria-invalid={!!errors.password}
            className={cn(inputClasses, "h-10 pr-10", errors.password && "border-danger/60")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            aria-label={showPassword ? "Hide password" : "Show password"}
            aria-pressed={showPassword}
            className="absolute right-1 top-1/2 inline-flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-md text-fg-subtle transition-colors hover:bg-hover hover:text-fg"
          >
            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          </button>
        </div>
      </Field>

      <Button type="submit" variant="primary" size="lg" className="w-full" disabled={pending || disabled}>
        {pending && <LoaderCircle className="h-4 w-4 animate-spin" />}
        {isSignUp ? (pending ? "Creating account…" : "Create account") : pending ? "Signing in…" : "Sign in"}
      </Button>

      <p className="pt-1 text-center text-[13px] text-fg-subtle">
        {isSignUp ? "Already have an account? " : "New to CodeLab? "}
        <Link
          href={`${isSignUp ? "/login" : "/signup"}${query}`}
          className="font-medium text-accent underline-offset-4 hover:underline"
        >
          {isSignUp ? "Sign in" : "Create an account"}
        </Link>
      </p>
    </form>
  );
}
