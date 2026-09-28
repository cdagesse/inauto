import { createHash } from "node:crypto";
import { after, NextResponse } from "next/server";
import { z } from "zod";
import { db } from "@/db";
import { outboundClicks } from "@/db/schema";
import { env } from "@/env/server";
import { clientIp } from "@/lib/rate-limit";
import { getExternalTarget } from "@/server/queries/external";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound link to the platform that hosts an external listing. Redirects, then
 * logs an anonymous click (salted, truncated IP hash) after the response is sent.
 * Clicks are never attributed to a user: this route is excluded from
 * clerkMiddleware (see proxy.ts), so Clerk's auth() must not be called here.
 * We only ever redirect to the URL stored on the listing row, never to a query param.
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!z.string().uuid().safeParse(id).success)
    return new NextResponse("Not found", { status: 404 });
  const target = await getExternalTarget(id);
  if (!target) return new NextResponse("Not found", { status: 404 });
  let dest: URL;
  try {
    dest = new URL(target.url);
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
  if (dest.protocol !== "https:" && dest.protocol !== "http:")
    return new NextResponse("Not found", { status: 404 });

  const ipHash = createHash("sha256")
    .update(`${clientIp(req.headers)}|${env.ipHashSalt}`)
    .digest("hex")
    .slice(0, 32);
  after(async () => {
    try {
      await db
        .insert(outboundClicks)
        .values({ externalListingId: target.id, userId: null, ipHash });
    } catch (e) {
      console.error("outbound_click insert failed", e instanceof Error ? e.message : e);
    }
  });
  return NextResponse.redirect(dest, { status: 302, headers: { "Cache-Control": "no-store" } });
}
