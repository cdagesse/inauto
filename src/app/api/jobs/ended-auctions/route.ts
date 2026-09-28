import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env/server";
import { ENDED_SWEEP_JOB, sweepEndedAuctions } from "@/jobs/ended-auctions";
import { recordRun } from "@/jobs/lib/run";
import { requireCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** Every 6 hours (vercel.json): final results for auctions that closed since the last sweep. */
async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("live") === "1" ? false : env.jobsDryRun;
  try {
    const summary = await recordRun(
      db,
      ENDED_SWEEP_JOB,
      { dryRun },
      () => sweepEndedAuctions({ dryRun }),
      (s) => ({
        ok: s.errors.length === 0,
        changed: s.upserted + s.auctionResultsInserted,
        summary: s,
        error: s.errors[0] ?? null,
      }),
    );
    if (summary.upserted + summary.auctionResultsInserted > 0) revalidatePath("/listings");
    return NextResponse.json(summary, { status: summary.errors.length ? 500 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "ended-auctions failed" },
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
