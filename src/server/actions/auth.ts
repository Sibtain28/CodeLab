"use server";

import { isAPIError } from "better-auth/api";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getAuth } from "../auth";
import { SetupRequiredError } from "../config";
import { rateLimit } from "../rate-limit";

export interface AuthFormState {
  error?: string;
  fieldErrors?: Partial<Record<"name" | "email" | "password", string>>;
  /** Echo back non-secret fields so the form keeps them. Never the password. */
  values?: { name?: string; email?: string };
}

const email = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, "That email is too long.")
  .pipe(z.email("Enter a valid email address."));

const signUpSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Use 80 characters or fewer."),
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters.")
    .max(128, "Use 128 characters or fewer."),
});

const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(128, "Incorrect email or password."),
});

/** Only allow redirects back into the app's own private pages. */
function safeNext(value: FormDataEntryValue | null) {
  if (typeof value !== "string") return "/dashboard";
  if (!/^\/(dashboard|workspace\/[A-Za-z0-9_-]+|join\/[A-Za-z0-9_-]{43})$/.test(value)) return "/dashboard";
  return value;
}

async function clientKey() {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

function fieldErrors(error: z.ZodError): AuthFormState["fieldErrors"] {
  const out: AuthFormState["fieldErrors"] = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as "name" | "email" | "password";
    out[key] ??= issue.message;
  }
  return out;
}

const SETUP_MESSAGE =
  "CodeLab isn't connected to a database yet. Add DATABASE_URL, BETTER_AUTH_SECRET and BETTER_AUTH_URL to .env (see SETUP.md).";

export async function signUp(_prev: AuthFormState | null, form: FormData): Promise<AuthFormState> {
  const raw = { name: form.get("name"), email: form.get("email"), password: form.get("password") };
  const values = { name: String(raw.name ?? ""), email: String(raw.email ?? "") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const ip = await clientKey();
  const limit = rateLimit(`sign-up:${ip}`, 10, 10 * 60_000);
  if (!limit.ok) return { error: `Too many attempts. Try again in ${limit.retryAfterSec}s.`, values };

  try {
    await getAuth().api.signUpEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    if (error instanceof SetupRequiredError) return { error: SETUP_MESSAGE, values };
    if (isAPIError(error)) {
      const code = (error.body as { code?: string } | undefined)?.code ?? "";
      if (code.startsWith("USER_ALREADY_EXISTS")) {
        return { fieldErrors: { email: "An account with this email already exists." }, values };
      }
      if (code.startsWith("PASSWORD_TOO")) return { fieldErrors: { password: "Use 8–128 characters." }, values };
    }
    console.error("sign-up failed", error);
    return { error: "Couldn't create your account. Please try again.", values };
  }
  redirect(safeNext(form.get("next")));
}

export async function signIn(_prev: AuthFormState | null, form: FormData): Promise<AuthFormState> {
  const raw = { email: form.get("email"), password: form.get("password") };
  const values = { email: String(raw.email ?? "") };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { fieldErrors: fieldErrors(parsed.error), values };

  const ip = await clientKey();
  const perAccount = rateLimit(`sign-in:${ip}:${parsed.data.email}`, 5, 60_000);
  const perIp = rateLimit(`sign-in:${ip}`, 30, 10 * 60_000);
  if (!perAccount.ok || !perIp.ok) {
    const wait = Math.max(perAccount.ok ? 0 : perAccount.retryAfterSec, perIp.ok ? 0 : perIp.retryAfterSec);
    return { error: `Too many attempts. Try again in ${wait}s.`, values };
  }

  try {
    await getAuth().api.signInEmail({ body: parsed.data, headers: await headers() });
  } catch (error) {
    if (error instanceof SetupRequiredError) return { error: SETUP_MESSAGE, values };
    if (isAPIError(error) && (error.status === "UNAUTHORIZED" || error.statusCode === 401)) {
      return { error: "Incorrect email or password.", values };
    }
    console.error("sign-in failed", error);
    return { error: "Couldn't sign you in. Please try again.", values };
  }
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  try {
    await getAuth().api.signOut({ headers: await headers() });
  } catch (error) {
    // Already signed out (or no database): still leave the private area.
    if (!(error instanceof SetupRequiredError)) console.error("sign-out failed", error);
  }
  redirect("/login");
}
