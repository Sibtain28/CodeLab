import "server-only";
import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { nextCookies } from "better-auth/next-js";
import { requireConfig } from "./config";
import { getDb } from "./db";

/**
 * Better Auth (email + password). Passwords are hashed with scrypt by Better
 * Auth; sessions live in the `session` table and are referenced by an
 * httpOnly, signed cookie.
 *
 * All auth calls go through server actions (see app/(auth)/actions.ts) that
 * call `auth.api.*` directly, so session tokens are never returned to
 * browser JavaScript. `nextCookies()` lets those server actions set the
 * cookie and must stay the last plugin.
 */
function createAuth() {
  const { authSecret, authUrl } = requireConfig();
  return betterAuth({
    appName: "CodeLab",
    baseURL: authUrl,
    secret: authSecret,
    database: prismaAdapter(getDb(), { provider: "postgresql" }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // refresh expiry at most once a day
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as unknown as { auth?: Auth };

export function getAuth(): Auth {
  globalForAuth.auth ??= createAuth();
  return globalForAuth.auth;
}
