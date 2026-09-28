import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { db } from "@/db";
import { requireCron } from "@/lib/cron-auth";
import { closeEndedAuctions } from "@/jobs/close-auctions";
import { recordRun } from "@/jobs/lib/run";

export const runtime = "nodejs";
export const maxDuration = 60;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  try {
    const summary = await recordRun(
      db,
      "close-auctions",
      { dryRun: false },
      () => closeEndedAuctions({ db }),
      (s) => ({ ok: true, changed: s.closed, summary: s }),
    );
    if (summary.closed > 0) {
      revalidatePath("/listings");
      for (const { id } of summary.ids) revalidatePath(`/listings/${id}`);
    }
    return NextResponse.json(summary);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "close-auctions failed" },
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
