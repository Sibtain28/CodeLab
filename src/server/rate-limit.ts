import "server-only";

/**
 * Small fixed-window limiter for auth attempts made through server actions
 * (Better Auth's own limiter only covers its HTTP endpoints).
 *
 * In-memory: limits are per server instance and reset on restart. That's
 * enough for local development and a single server; a multi-instance
 * deployment should move this to a shared store (e.g. Redis or Postgres).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  if (buckets.size > 10_000) {
    for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { ok: true as const };
  }
  if (bucket.count >= limit) {
    return { ok: false as const, retryAfterSec: Math.ceil((bucket.resetAt - now) / 1000) };
  }
  bucket.count += 1;
  return { ok: true as const };
}
