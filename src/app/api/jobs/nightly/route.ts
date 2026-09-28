import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/env/server";
import { sweepPurchaseEvidence } from "@/jobs/evidence-sweep";
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
  const summary = await runNightly({ dryRun });
  // Precompute every model's market report once, so pages read stored JSON.
  const snapshots = await rebuildAllSnapshots(undefined, (m) => console.log(`[nightly] ${m}`));
  // Model pages are statically cached for an hour; fresh data must invalidate them.
  // "layout" covers /markets and every drill-down under it, which render from the same tree.
  revalidatePath("/[make]/[model]", "page");
  revalidatePath("/markets", "layout");
  revalidatePath("/");
  // Evidence blobs upload before a purchase is submitted; drop the ones nothing references.
  let evidence: Awaited<ReturnType<typeof sweepPurchaseEvidence>> | { error: string };
  try {
    evidence = await sweepPurchaseEvidence({ dryRun, log: (m) => console.log(`[nightly] ${m}`) });
  } catch (e) {
    evidence = { error: e instanceof Error ? e.message : String(e) };
    console.error("[nightly] evidence sweep failed", e);
  }
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
