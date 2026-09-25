import { timingSafeEqual } from "node:crypto";
import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { env } from "@/env/server";
import { syncLiveAuctions } from "@/jobs/live-auctions";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!env.CRON_SECRET)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const live = url.searchParams.get("live") === "1";
  const scope = url.searchParams.get("scope") === "catalog" ? "catalog" : "all";
  try {
    const summary = await syncLiveAuctions({ dryRun: live ? false : env.jobsDryRun, scope });
    if (summary.upserted + summary.markedEnded + summary.reconciled > 0)
      revalidatePath("/listings");
    return NextResponse.json(summary, { status: summary.errors.length ? 500 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "live-auctions failed" },
      { status: 500 },
    );
  }
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
