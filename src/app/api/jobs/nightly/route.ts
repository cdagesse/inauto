import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env/server";
import { runNightly } from "@/jobs/nightly";

export const runtime = "nodejs";
export const maxDuration = 300;
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const secret = env.CRON_SECRET;
  if (!secret) return false;
  const header = req.headers.get("authorization") ?? "";
  const expected = `Bearer ${secret}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handle(req: Request) {
  if (!env.CRON_SECRET)
    return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const url = new URL(req.url);
  const dryRun = url.searchParams.get("live") === "1" ? false : env.jobsDryRun;
  const summary = await runNightly({ dryRun });
  return NextResponse.json(summary, { status: summary.errors.length ? 500 : 200 });
}

export async function GET(req: Request) {
  return handle(req);
}
export async function POST(req: Request) {
  return handle(req);
}
