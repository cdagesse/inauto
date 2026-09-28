import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { db } from "@/db";
import { recordRun } from "@/jobs/lib/run";
import { runTitleVetting } from "@/jobs/title-vetting";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const summary = await recordRun(
    db,
    "title-vetting",
    { dryRun: false },
    () => runTitleVetting(),
    (s) => ({
      ok: s.errors.length === 0,
      changed: s.processed.length,
      summary: s,
      error: s.errors[0] ?? null,
    }),
  );
  if (summary.processed.length) {
    revalidatePath("/tools");
    revalidatePath("/listings");
  }
  return NextResponse.json(summary, { status: summary.errors.length ? 500 : 200 });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
