import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env/server";
import {
  getSubscription,
  setHmacSecurity,
  subscribe,
  unsubscribe,
} from "@/lib/sources/vitu-notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-shot registration of our webhook with a Vitu Notifications product.
 * Run once per product (and again if the key or domain changes):
 *   curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
 *     "https://inauto-nu.vercel.app/api/jobs/vitu-subscribe?product=mvr"
 * GET shows the current subscription; DELETE removes it.
 * The product's notifications base must be configured (VITU_NOTIFY_MVR_BASE /
 * VITU_NOTIFY_NMVTIS_BASE) and VITU_WEBHOOK_KEY set: it becomes the HMAC key.
 */
function authorized(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

function config(req: Request) {
  const product = new URL(req.url).searchParams.get("product") ?? "mvr";
  const vitu = env.vitu;
  const base =
    product === "nmvtis"
      ? env.vituNotifyNmvtisBase
      : product === "mvr"
        ? env.vituNotifyMvrBase
        : null;
  if (!vitu) return { error: "Vitu credentials not configured", status: 503 } as const;
  if (!base)
    return { error: `notifications base for "${product}" not configured`, status: 503 } as const;
  return { c: { ...vitu, base }, product } as const;
}

async function handle(req: Request) {
  if (!env.CRON_SECRET)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const cfg = config(req);
  if ("error" in cfg) return NextResponse.json({ error: cfg.error }, { status: cfg.status });
  try {
    if (req.method === "GET") return NextResponse.json(await getSubscription(cfg.c));
    if (req.method === "DELETE") return NextResponse.json(await unsubscribe(cfg.c));
    const key = env.vituWebhookKey;
    if (!key) return NextResponse.json({ error: "VITU_WEBHOOK_KEY not set" }, { status: 503 });
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://inauto-nu.vercel.app";
    const callbackUrl = `${origin.replace(/\/$/, "")}/api/webhooks/vitu?product=${cfg.product}`;
    const security = await setHmacSecurity(cfg.c, key);
    const subscription = await subscribe(cfg.c, callbackUrl);
    return NextResponse.json({ ok: true, callbackUrl, security, subscription });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 502 });
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
