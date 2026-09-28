import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env/server";
import { recordRun } from "@/jobs/lib/run";
import { REMATCH_JOB, rematchListings } from "@/jobs/rematch-listings";
import { requireCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/** By hand, after an alias or matcher change: links platform listings that had no catalog model. */
async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("live") === "1" ? false : env.jobsDryRun;
  try {
    const summary = await recordRun(
      db,
      REMATCH_JOB,
      { dryRun },
      () => rematchListings({ dryRun }),
      (s) => ({
        ok: s.errors.length === 0,
        changed: s.updated,
        summary: s,
        error: s.errors[0] ?? null,
      }),
    );
    if (summary.updated > 0) revalidatePath("/listings");
    return NextResponse.json(summary, { status: summary.errors.length ? 500 : 200 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "rematch-listings failed" },
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
