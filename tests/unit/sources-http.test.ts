import { describe, expect, it } from "vitest";
import {
  backoffMs,
  extractRateLimit,
  fetchJson,
  HttpError,
  redactParams,
  redactUrl,
  USER_AGENT,
} from "@/lib/sources/http";

function mockFetch(
  responses: { status: number; body?: unknown; headers?: Record<string, string> }[],
) {
  const calls: { url: string; init: RequestInit }[] = [];
  const impl = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init: init ?? {} });
    const r = responses.shift() ?? { status: 200, body: {} };
    return new Response(r.body === undefined ? "" : JSON.stringify(r.body), {
      status: r.status,
      headers: { "content-type": "application/json", ...(r.headers ?? {}) },
    });
  }) as typeof fetch;
  return { impl, calls };
}
const noSleep = async () => {};

describe("http wrapper", () => {
  it("sends a real User-Agent and parses JSON", async () => {
    const { impl, calls } = mockFetch([{ status: 200, body: { data: [1, 2] } }]);
    const res = await fetchJson<{ data: number[] }>("https://x.test/a", {
      fetchImpl: impl,
      sleepImpl: noSleep,
    });
    expect(res.ok).toBe(true);
    expect(res.body?.data).toEqual([1, 2]);
    const h = calls[0].init.headers as Record<string, string>;
    expect(h["User-Agent"]).toBe(USER_AGENT);
  });

  it("retries on 429 and 5xx then succeeds", async () => {
    const { impl, calls } = mockFetch([
      { status: 429, headers: { "retry-after": "0" } },
      { status: 503 },
      { status: 200, body: { ok: 1 } },
    ]);
    const res = await fetchJson("https://x.test/a", { fetchImpl: impl, sleepImpl: noSleep });
    expect(res.status).toBe(200);
    expect(res.attempts).toBe(3);
    expect(calls.length).toBe(3);
  });

  it("throws HttpError after exhausting retries, with the URL redacted", async () => {
    const { impl } = mockFetch([{ status: 500 }, { status: 500 }, { status: 500 }]);
    await expect(
      fetchJson("https://x.test/a?api_key=SECRET123", { fetchImpl: impl, sleepImpl: noSleep }),
    ).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof HttpError && e.status === 500 && !e.message.includes("SECRET123"),
    );
  });

  it("does not retry plain 4xx and returns the body", async () => {
    const { impl, calls } = mockFetch([{ status: 403, body: { error: "no ua" } }]);
    const res = await fetchJson<{ error: string }>("https://x.test/a", {
      fetchImpl: impl,
      sleepImpl: noSleep,
    });
    expect(res.ok).toBe(false);
    expect(res.body?.error).toBe("no ua");
    expect(calls.length).toBe(1);
  });

  it("captures rate-limit headers", () => {
    const h = new Headers({
      "X-RateLimit-Remaining": "7",
      "Retry-After": "3",
      "Content-Type": "x",
    });
    expect(extractRateLimit(h)).toEqual({ "x-ratelimit-remaining": "7", "retry-after": "3" });
  });

  it("backoff honours retry-after and grows with attempts", () => {
    expect(backoffMs(0, "2", () => 0)).toBe(2000);
    expect(backoffMs(0, undefined, () => 0)).toBe(500);
    expect(backoffMs(2, undefined, () => 0)).toBe(2000);
  });

  it("redacts secrets in urls and params", () => {
    expect(redactUrl("https://x.test/a?token=abc&make=Porsche")).toBe(
      "https://x.test/a?token=REDACTED&make=Porsche",
    );
    expect(redactParams({ api_key: "k", page: 2 })).toEqual({ api_key: "REDACTED", page: 2 });
  });
});
