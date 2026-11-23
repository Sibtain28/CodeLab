import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto";

export interface TerminalClaims {
  v: 1;
  uid: string;
  pid: string;
  executionId: string;
  exp: number;
  isProjectOwner?: boolean;
}

const keys = new Map<string, Buffer>();

function keyFor(secret: string): Buffer {
  let key = keys.get(secret);
  if (!key) {
    key = Buffer.from(hkdfSync("sha256", secret, "codelab", "terminal-token-v1", 32));
    keys.set(secret, key);
  }
  return key;
}

export function signTerminalToken(claims: Omit<TerminalClaims, "v">, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ v: 1, ...claims })).toString("base64url");
  const signature = createHmac("sha256", keyFor(secret)).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyTerminalToken(token: unknown, secret: string, now = Date.now()): TerminalClaims | null {
  if (typeof token !== "string" || token.length > 1024) return null;
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra !== undefined) return null;

  const expected = Buffer.from(createHmac("sha256", keyFor(secret)).update(payload).digest("base64url"));
  const given = Buffer.from(signature);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Partial<TerminalClaims>;
    if (
      claims.v !== 1 ||
      typeof claims.uid !== "string" ||
      typeof claims.pid !== "string" ||
      typeof claims.executionId !== "string" ||
      typeof claims.exp !== "number" ||
      claims.exp <= now
    ) {
      return null;
    }
    return {
      v: 1,
      uid: claims.uid,
      pid: claims.pid,
      executionId: claims.executionId,
      exp: claims.exp,
      isProjectOwner: claims.isProjectOwner === true,
    };
  } catch {
    return null;
  }
}
