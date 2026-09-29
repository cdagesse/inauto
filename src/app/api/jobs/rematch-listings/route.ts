import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { env } from "@/env/server";
import { recordRun } from "@/jobs/lib/run";
import { REMATCH_JOB, rematchListings, type RematchScope } from "@/jobs/rematch-listings";
import { requireCron } from "@/lib/cron-auth";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

/**
 * By hand, after an alias or matcher change: links platform listings that had no catalog
 * model. `?scope=all` also moves listings and auction results whose match changed;
 * `&models=ferrari/360,ferrari/360-challenge-stradale` limits that to moves touching those.
 */
async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("live") === "1" ? false : env.jobsDryRun;
  const scope: RematchScope = url.searchParams.get("scope") === "all" ? "all" : "unmatched";
  const onlyModels = (url.searchParams.get("models") ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  try {
    const summary = await recordRun(
      db,
      REMATCH_JOB,
      { dryRun },
      () => rematchListings({ dryRun, scope, onlyModels }),
      (s) => ({
        ok: s.errors.length === 0,
        changed: s.updated + s.auctionsUpdated,
        summary: s,
        error: s.errors[0] ?? null,
      }),
    );
    if (summary.updated + summary.auctionsUpdated > 0) {
      revalidatePath("/listings");
      // Model pages, the markets drill-down and the home page read the rebuilt snapshots.
      revalidatePath("/[make]/[model]", "page");
      revalidatePath("/markets", "layout");
      revalidatePath("/");
    }
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
