import { describe, expect, it } from "vitest";
import { hmacFor, setHmacSecurity, subscribe, verifyHmac } from "@/lib/sources/vitu-notifications";

const key = "0123456789abcdef0123456789abcdef0123456789abcdef";

describe("callback HMAC", () => {
  it("verifies base64 HMAC-SHA256 of the raw body and rejects tampering", () => {
    const body = JSON.stringify({
      refNumber: "36b67283-2305-46a5-a827-22f38a9338b8",
      inquiryId: 42,
    });
    const sig = hmacFor(key, body);
    expect(verifyHmac(key, body, sig)).toBe(true);
    expect(verifyHmac(key, body + " ", sig)).toBe(false);
    expect(verifyHmac(key, body, null)).toBe(false);
    expect(verifyHmac("x".repeat(48), body, sig)).toBe(false);
  });
});

describe("subscription calls", () => {
  const calls: { url: string; method: string; body: string | null; auth: string | null }[] = [];
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = String(input);
    if (url.includes("/token"))
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 300 }), {
        status: 200,
      });
    calls.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? init.body : null,
      auth: (init?.headers as Record<string, string>)?.Authorization ?? null,
    });
    return new Response("{}", { status: 201 });
  };
  const c = {
    clientId: "id",
    clientSecret: "secret",
    authUrl: "https://auth.test.vitu.com/realms/api/protocol/openid-connect/token",
    scope: "oneapi:access",
    apiBase: "https://api-test.vitu.com/one/nmvtis/api/v1",
    fetchImpl,
  };
  it("subscribes with callbackUrl as a query parameter and sets HMAC security", async () => {
    await setHmacSecurity(c, key);
    await subscribe(c, "https://inauto-nu.vercel.app/api/webhooks/vitu?product=nmvtis");
    expect(calls[0]).toMatchObject({
      url: "https://api-test.vitu.com/one/nmvtis/api/v1/security/callback",
      method: "PUT",
      auth: "Bearer tok",
    });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ hmacSettings: { key, headerName: "X-HMAC" } });
    expect(calls[1]).toMatchObject({
      url: "https://api-test.vitu.com/one/nmvtis/api/v1/subscription?callbackUrl=https%3A%2F%2Finauto-nu.vercel.app%2Fapi%2Fwebhooks%2Fvitu%3Fproduct%3Dnmvtis",
      method: "PUT",
    });
  });
  it("refuses non-https callbacks and short keys", async () => {
    await expect(subscribe(c, "http://x")).rejects.toThrow(/https/);
    await expect(setHmacSecurity(c, "short")).rejects.toThrow(/32/);
  });
});
