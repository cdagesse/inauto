import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { env } from "@/env/server";
import { sweepPurchaseEvidence } from "@/jobs/evidence-sweep";
import { recordRun } from "@/jobs/lib/run";
import { requireCron } from "@/lib/cron-auth";
import { runNightly } from "@/jobs/nightly";
import { rebuildAllSnapshots } from "@/lib/market/store";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("live") === "1" ? false : env.jobsDryRun;
  const started = Date.now();
  const log = (m: string) => console.log(`[nightly] ${m}`);
  const summary = await runNightly({ dryRun });
  // Evidence blobs upload before a purchase is submitted; drop the ones nothing references.
  // Cheap, so it runs before the snapshot pass that may use the rest of the function's time.
  let evidence: Awaited<ReturnType<typeof sweepPurchaseEvidence>> | { error: string };
  try {
    evidence = await recordRun(
      db,
      "evidence-sweep",
      { dryRun },
      () => sweepPurchaseEvidence({ dryRun, log }),
      (s) => ({ ok: true, changed: s.deleted, summary: s }),
    );
  } catch (e) {
    evidence = { error: e instanceof Error ? e.message : String(e) };
    console.error("[nightly] evidence sweep failed", e);
  }
  // Precompute every model's market report once, so pages read stored JSON. The whole
  // route shares one 300 s function, so the rebuild stops (and says so) at 270 s.
  const snapshots = await recordRun(
    db,
    "snapshots",
    { dryRun: false },
    () => rebuildAllSnapshots(db, log, new Date(), { deadline: started + 270_000 }),
    (s) => ({
      ok: s.failed.length === 0,
      changed: s.built,
      summary: s,
      error: s.failed[0] ?? null,
    }),
  );
  // Model pages are statically cached for an hour; fresh data must invalidate them.
  // "layout" covers /markets and every drill-down under it, which render from the same tree.
  revalidatePath("/[make]/[model]", "page");
  revalidatePath("/markets", "layout");
  revalidatePath("/");
  return NextResponse.json(
    { ...summary, snapshots, evidence },
    { status: summary.errors.length || snapshots.failed.length ? 500 : 200 },
  );
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
