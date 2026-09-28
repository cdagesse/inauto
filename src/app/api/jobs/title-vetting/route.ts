import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { requireCron } from "@/lib/cron-auth";
import { runTitleVetting } from "@/jobs/title-vetting";

export const runtime = "nodejs";
export const maxDuration = 120;
export const dynamic = "force-dynamic";

async function handle(req: Request) {
  const denied = requireCron(req);
  if (denied) return denied;
  const summary = await runTitleVetting();
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
