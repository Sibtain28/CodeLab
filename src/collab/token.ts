/**
 * Short-lived tokens that let a signed-in project member open collaboration
 * rooms. Issued by the Next.js server (after the normal session + membership
 * check) and verified by the collab server.
 *
 * Format: base64url(JSON claims) + "." + base64url(HMAC-SHA256). The HMAC key
 * is derived from BETTER_AUTH_SECRET with HKDF, so no extra secret is needed
 * and the raw auth secret is never used directly for this purpose.
 *
 * Imported only by server code (Next.js server actions and the collab server).
 */
import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export interface CollabClaims {
  v: 1;
  /** User id (from the verified session). */
  uid: string;
  /** Project id the user is a member of. */
  pid: string;
  /** Expiry, ms since epoch. */
  exp: number;
}

export const COLLAB_TOKEN_TTL_MS = 10 * 60 * 1000;

const keys = new Map<string, Buffer>();
function keyFor(secret: string) {
  let key = keys.get(secret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", secret, "codelab", "collab-token-v1", 32));
    keys.set(secret, key);
  }
  return key;
}

const sign = (payload: string, secret: string) =>
  createHmac("sha256", keyFor(secret)).update(payload).digest("base64url");

export function signCollabToken(claims: Omit<CollabClaims, "v">, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims })).toString("base64url");
  return `${payload}.${sign(payload, secret)}`;
}

/** Returns the claims, or null for anything malformed, forged or expired. */
export function verifyCollabToken(token: unknown, secret: string, now = Date.now()): CollabClaims | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<CollabClaims>;
    if (
      claims.v !== 1 ||
      typeof claims.uid !== "string" ||
      typeof claims.pid !== "string" ||
      typeof claims.exp !== "number" ||
      claims.exp <= now
    ) {
      return null;
    }
    return { v: 1, uid: claims.uid, pid: claims.pid, exp: claims.exp };
  } catch {
    return null;
  }
}
