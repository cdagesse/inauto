import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { serviceOrders } from "@/db/schema";
import { env } from "@/env/server";
import { runTitleVetting } from "@/jobs/title-vetting";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Receiver for Vitu's MVR notification subscription (CallbackDTO: refNumber,
 * inquiryId, processedDate, error). The payload is only a trigger: we match the
 * refNumber to our order and read the record back from Vitu ourselves, so a
 * forged call cannot inject data. Protect the URL with ?key=VITU_WEBHOOK_KEY.
 */
export async function POST(req: Request) {
  const key = env.vituWebhookKey;
  if (!key) return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  const url = new URL(req.url);
  const given = url.searchParams.get("key") ?? req.headers.get("x-webhook-key") ?? "";
  const a = Buffer.from(given);
  const b = Buffer.from(key);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  let body: { refNumber?: string; inquiryId?: number; processedDate?: string; error?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid json" }, { status: 400 });
  }
  const ref = typeof body.refNumber === "string" ? body.refNumber : null;
  if (!ref || !/^[0-9a-f-]{36}$/i.test(ref))
    return NextResponse.json({ ok: true, ignored: "no refNumber" });
  const [order] = await db
    .select({ id: serviceOrders.id })
    .from(serviceOrders)
    .where(sql`${serviceOrders.details}->'mvr'->>'refNumber' = ${ref}`)
    .limit(1);
  if (!order) return NextResponse.json({ ok: true, ignored: "unknown refNumber" });
  const summary = await runTitleVetting({ onlyOrderId: order.id, limit: 1 });
  return NextResponse.json({
    ok: true,
    orderId: order.id,
    processed: summary.processed,
    errors: summary.errors,
  });
}
