import "server-only";

/**
 * Server configuration read from environment variables. Values never leave
 * the server; only the *names* of missing variables are shown to the user.
 */
const REQUIRED = ["DATABASE_URL", "BETTER_AUTH_SECRET", "BETTER_AUTH_URL"] as const;

export type ConfigKey = (typeof REQUIRED)[number];

export function missingConfig(): ConfigKey[] {
  return REQUIRED.filter((key) => !process.env[key]?.trim());
}

export function isConfigured() {
  return missingConfig().length === 0;
}

/** Thrown when the app runs without the environment it needs. */
export class SetupRequiredError extends Error {
  constructor(public readonly missing: ConfigKey[]) {
    super(`Missing environment variables: ${missing.join(", ")}`);
    this.name = "SetupRequiredError";
  }
}

export function requireConfig() {
  const missing = missingConfig();
  if (missing.length) throw new SetupRequiredError(missing);
  return {
    databaseUrl: process.env.DATABASE_URL!,
    authSecret: process.env.BETTER_AUTH_SECRET!,
    authUrl: process.env.BETTER_AUTH_URL!,
  };
}
