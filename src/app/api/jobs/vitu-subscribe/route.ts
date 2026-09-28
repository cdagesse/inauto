import { NextResponse } from "next/server";
import { env } from "@/env/server";
import { requireCron } from "@/lib/cron-auth";
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
 *     "https://ur.car/api/jobs/vitu-subscribe?product=mvr"
 * GET shows the current subscription; DELETE removes it.
 * Each Notifications product is served from its parent API's base, so only the
 * product needs to be enabled. VITU_WEBHOOK_KEY becomes the HMAC key.
 */
function config(req: Request) {
  const product = new URL(req.url).searchParams.get("product") ?? "mvr";
  const vitu = env.vitu;
  if (!vitu) return { error: "Vitu credentials not configured", status: 503 } as const;
  const apiBase =
    product === "nmvtis" ? vitu.nmvtis?.apiBase : product === "mvr" ? vitu.mvr?.apiBase : null;
  if (!apiBase) return { error: `product "${product}" is not enabled`, status: 503 } as const;
  return { c: { ...vitu, apiBase }, product } as const;
}

async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const cfg = config(req);
  if ("error" in cfg) return NextResponse.json({ error: cfg.error }, { status: cfg.status });
  try {
    if (req.method === "GET") return NextResponse.json(await getSubscription(cfg.c));
    if (req.method === "DELETE") return NextResponse.json(await unsubscribe(cfg.c));
    const key = env.vituWebhookKey;
    if (!key) return NextResponse.json({ error: "VITU_WEBHOOK_KEY not set" }, { status: 503 });
    const origin = process.env.NEXT_PUBLIC_SITE_URL ?? "https://ur.car";
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
