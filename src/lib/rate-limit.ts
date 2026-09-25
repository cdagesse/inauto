/**
 * In-memory sliding-window rate limiter, keyed by caller (usually IP).
 *
 * This is defense in depth only: state lives per server instance and is lost
 * on cold start. The durable layer is a Vercel WAF rate-limit rule on the
 * same paths, which is enforced at the edge across all instances.
 */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
const MAX_KEYS = 10_000;

export interface RateLimitResult {
  ok: boolean;
  remaining: number;
  retryAfterSec: number;
}

export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now = Date.now(),
): RateLimitResult {
  const since = now - windowMs;
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size >= MAX_KEYS) {
      // Drop the oldest entries rather than grow without bound.
      let n = 0;
      for (const k of buckets.keys()) {
        buckets.delete(k);
        if (++n >= MAX_KEYS / 10) break;
      }
    }
    b = { hits: [] };
    buckets.set(key, b);
  }
  b.hits = b.hits.filter((t) => t > since);
  if (b.hits.length >= limit) {
    const retryAfterSec = Math.max(1, Math.ceil((b.hits[0] + windowMs - now) / 1000));
    return { ok: false, remaining: 0, retryAfterSec };
  }
  b.hits.push(now);
  return { ok: true, remaining: limit - b.hits.length, retryAfterSec: 0 };
}

/** Best-effort client IP from Vercel / proxy headers. */
export function clientIp(headers: Headers): string {
  const fwd = headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return headers.get("x-real-ip") ?? "unknown";
}
