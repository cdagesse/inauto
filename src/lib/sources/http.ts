/**
 * Minimal fetch wrapper for third-party market APIs.
 *
 * - 20 s timeout via AbortController
 * - retry with jittered exponential backoff on 429 / 5xx / network errors (3 attempts)
 * - always sends a real User-Agent (Old Cars Data returns 403 without one)
 * - captures rate-limit, usage and pricing headers into a plain object for logging
 * - never logs secrets: headers are not logged, and URLs are redacted before they appear in errors
 */

export const USER_AGENT = "InAuto/0.1 (+https://inauto-nu.vercel.app)";
const TIMEOUT_MS = 20_000;
const MAX_ATTEMPTS = 3;

export interface HttpResult<T = unknown> {
  status: number;
  ok: boolean;
  body: T | null;
  rateLimit: Record<string, string>;
  /** Wall-clock milliseconds for the final attempt. */
  ms: number;
  attempts: number;
}

export class HttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly rateLimit: Record<string, string>,
  ) {
    super(message);
    this.name = "HttpError";
  }
}

const SECRET_QUERY_KEYS = /^(api[_-]?key|key|token|access[_-]?token|secret|authorization)$/i;

/** Strip credential-looking query params so a URL is safe to log or store. */
export function redactUrl(url: string): string {
  try {
    const u = new URL(url);
    for (const k of [...u.searchParams.keys()]) {
      if (SECRET_QUERY_KEYS.test(k)) u.searchParams.set(k, "REDACTED");
    }
    return u.toString();
  } catch {
    return "[unparseable url]";
  }
}

/** Strip credential-looking keys from a params object before it is stored in raw_fetch. */
export function redactParams(params: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params)) out[k] = SECRET_QUERY_KEYS.test(k) ? "REDACTED" : v;
  return out;
}

export function extractRateLimit(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((v, k) => {
    const lk = k.toLowerCase();
    if (
      lk.startsWith("x-ratelimit") ||
      lk.startsWith("ratelimit") ||
      lk === "retry-after" ||
      lk.startsWith("x-visor") ||
      lk.startsWith("x-usage") ||
      lk.startsWith("x-billing") ||
      lk.startsWith("x-price") ||
      lk.startsWith("x-request-id")
    )
      out[lk] = v;
  });
  return out;
}

export function backoffMs(
  attempt: number,
  retryAfterHeader?: string,
  random = Math.random,
): number {
  if (retryAfterHeader) {
    const secs = Number(retryAfterHeader);
    if (Number.isFinite(secs) && secs >= 0) return Math.min(secs * 1000, 60_000);
  }
  const base = 500 * 2 ** attempt; // 500, 1000, 2000
  return base + Math.floor(random() * 250);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export interface FetchJsonOptions {
  headers?: Record<string, string>;
  method?: "GET" | "POST";
  body?: unknown;
  /** Injected for tests. */
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<unknown>;
}

/**
 * GET/POST a JSON endpoint. Resolves with the parsed body on 2xx and on non-retryable
 * 4xx (so callers can inspect the error body); throws HttpError when retries are exhausted.
 */
export async function fetchJson<T = unknown>(
  url: string,
  opts: FetchJsonOptions = {},
): Promise<HttpResult<T>> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleepImpl = opts.sleepImpl ?? sleep;
  let lastErr: unknown = null;
  let lastRate: Record<string, string> = {};

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    const started = Date.now();
    try {
      const res = await fetchImpl(url, {
        method: opts.method ?? "GET",
        headers: {
          Accept: "application/json",
          "User-Agent": USER_AGENT,
          ...(opts.body ? { "Content-Type": "application/json" } : {}),
          ...(opts.headers ?? {}),
        },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctrl.signal,
      });
      const ms = Date.now() - started;
      const rateLimit = extractRateLimit(res.headers);
      lastRate = rateLimit;
      const retryable = res.status === 429 || res.status >= 500;
      if (retryable && attempt < MAX_ATTEMPTS - 1) {
        await sleepImpl(backoffMs(attempt, rateLimit["retry-after"]));
        continue;
      }
      let body: T | null = null;
      const text = await res.text();
      if (text) {
        try {
          body = JSON.parse(text) as T;
        } catch {
          body = null;
        }
      }
      if (retryable) {
        throw new HttpError(
          `${res.status} from ${redactUrl(url)} after ${attempt + 1} attempts`,
          res.status,
          rateLimit,
        );
      }
      return { status: res.status, ok: res.ok, body, rateLimit, ms, attempts: attempt + 1 };
    } catch (err) {
      if (err instanceof HttpError) throw err;
      lastErr = err;
      if (attempt < MAX_ATTEMPTS - 1) {
        await sleepImpl(backoffMs(attempt));
        continue;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  const reason = lastErr instanceof Error ? lastErr.name : "unknown";
  throw new HttpError(
    `network failure (${reason}) for ${redactUrl(url)} after ${MAX_ATTEMPTS} attempts`,
    0,
    lastRate,
  );
}
