import { timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { env } from "@/env/server";

/**
 * Bearer-token guard shared by every /api/jobs route (cron and hand-run jobs).
 * Returns the response to send when the caller is refused (503 when the deploy
 * has no CRON_SECRET, 401 otherwise) or null when the request may proceed:
 *
 *   const denied = requireCron(req);
 *   if (denied) return denied;
 *
 * Lives outside src/server so no "use server" directive can turn it into an action.
 */
export function requireCron(req: Request): NextResponse | null {
  const secret = env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "CRON_SECRET not configured" }, { status: 503 });
  const a = Buffer.from(req.headers.get("authorization") ?? "");
  const b = Buffer.from(`Bearer ${secret}`);
  if (a.length !== b.length || !timingSafeEqual(a, b))
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}
