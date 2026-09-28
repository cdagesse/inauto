import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/env/server";
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
  return NextResponse.json(
    { ...summary, snapshots },
    { status: summary.errors.length || snapshots.failed.length ? 500 : 200 },
  );
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
