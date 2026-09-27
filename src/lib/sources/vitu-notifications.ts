import { createHmac, timingSafeEqual } from "node:crypto";
import { getVituToken, type VituConfig, VituError } from "./vitu";

/**
 * Vitu "Notifications" products (one per API: NMVTIS, MVR, ...). Each exposes
 * the same three operations against its own base URL:
 *   PUT    /subscription?callbackUrl=https://...   Subscribe
 *   GET    /subscription                            GetSubscription -> { callbackUrl }
 *   DELETE /subscription                            Unsubscribe
 *   PUT    /security/callback                       SetCallbackSecurity
 * With HMAC configured, Vitu signs every callback: base64(HMAC-SHA256(key, body))
 * in the X-HMAC header (or the header name given).
 */
export type NotificationsConfig = Omit<VituConfig, "titlePath" | "titleMethod"> & { base: string };

async function call<T>(
  c: NotificationsConfig,
  method: "GET" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getVituToken({ ...c, titlePath: "", titleMethod: "POST" });
  const f = c.fetchImpl ?? fetch;
  const res = await f(`${c.base.replace(/\/$/, "")}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (!res.ok) throw new VituError("report", res.status, text.slice(0, 500));
  try {
    return (text ? JSON.parse(text) : {}) as T;
  } catch {
    return {} as T;
  }
}

export function getSubscription(c: NotificationsConfig) {
  return call<{ callbackUrl?: string }>(c, "GET", "/subscription");
}

export async function subscribe(c: NotificationsConfig, callbackUrl: string) {
  if (!/^https:\/\//.test(callbackUrl)) throw new Error("callbackUrl must be https");
  return call<object>(c, "PUT", `/subscription?callbackUrl=${encodeURIComponent(callbackUrl)}`);
}

export function unsubscribe(c: NotificationsConfig) {
  return call<object>(c, "DELETE", "/subscription");
}

/** HmacSettingsDTO: key 32–64 chars; Vitu sends base64(HMAC-SHA256) in X-HMAC. */
export async function setHmacSecurity(c: NotificationsConfig, key: string, headerName = "X-HMAC") {
  if (key.length < 32 || key.length > 64) throw new Error("HMAC key must be 32–64 characters");
  return call<object>(c, "PUT", "/security/callback", { hmacSettings: { key, headerName } });
}

export function hmacFor(key: string, rawBody: string): string {
  return createHmac("sha256", key).update(rawBody).digest("base64");
}

/** Constant-time check of an X-HMAC header against the raw request body. */
export function verifyHmac(key: string, rawBody: string, header: string | null): boolean {
  if (!header) return false;
  const a = Buffer.from(hmacFor(key, rawBody));
  const b = Buffer.from(header.trim());
  return a.length === b.length && timingSafeEqual(a, b);
}
