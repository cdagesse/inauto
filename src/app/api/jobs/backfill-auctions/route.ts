import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { env } from "@/env/server";
import { backfillAuctions } from "@/jobs/backfill-auctions";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

/**
 * One-time bulk pull (not scheduled). Run by hand with the cron secret:
 *   POST /api/jobs/backfill-auctions?part=live
 *   POST /api/jobs/backfill-auctions?part=past&days=30
 */
function authorized(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: Request) {
  if (!env.CRON_SECRET)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const part = url.searchParams.get("part") === "past" ? "past" : "live";
  const days = Number(url.searchParams.get("days") ?? 30);
  const maxPages = Number(url.searchParams.get("maxPages") ?? 150);
  try {
    const summary = await backfillAuctions({
      part,
      days: Number.isFinite(days) ? days : 30,
      maxPages: Number.isFinite(maxPages) ? maxPages : 150,
    });
    if (summary.upserted > 0) revalidatePath("/listings");
    return NextResponse.json(summary, { status: summary.errors.length ? 500 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "backfill failed" },
      { status: 500 },
    );
  }
}
