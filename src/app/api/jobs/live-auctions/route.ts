import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { env } from "@/env/server";
import { requireCron } from "@/lib/cron-auth";
import { syncLiveAuctions } from "@/jobs/live-auctions";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
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
