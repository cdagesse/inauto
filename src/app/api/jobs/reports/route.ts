import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { env } from "@/env/server";
import { requireCron } from "@/lib/cron-auth";
import { db } from "@/db";
import { recordRun } from "@/jobs/lib/run";
import { processReportRequests } from "@/jobs/report";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("live") === "1" ? false : env.jobsDryRun;
  const limit = Number(url.searchParams.get("limit") ?? 3) || 3;
  // Each model build records its own "report-build" run; this row is the queue pass.
  const result = await recordRun(
    db,
    "reports",
    { dryRun },
    () => processReportRequests({ dryRun, limit }),
    (r) => ({ ok: true, changed: r.processed.length, summary: { limit, processed: r.processed } }),
  );
  // Model pages are statically cached for an hour; fresh data must invalidate them.
  revalidatePath("/[make]/[model]", "page");
  revalidatePath("/markets", "layout");
  revalidatePath("/");
  return NextResponse.json({ dryRun, ...result });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
