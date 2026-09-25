import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { db } from "@/db";
import { outboundClicks } from "@/db/schema";
import { env } from "@/env/server";
import { clientIp } from "@/lib/rate-limit";
import { getExternalTarget } from "@/server/queries/external";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Outbound link to the platform that hosts an external listing. Logs a click
 * (salted, truncated IP hash + user id when signed in) and redirects. We only
 * ever redirect to the URL stored on the listing row, never to a query param.
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

  try {
    const session = await auth();
    const ipHash = createHash("sha256")
      .update(`${clientIp(req.headers)}|${env.AUTH_SECRET}`)
      .digest("hex")
      .slice(0, 32);
    await db.insert(outboundClicks).values({
      externalListingId: target.id,
      userId: session?.user?.id ?? null,
      ipHash,
    });
  } catch (e) {
    console.error("outbound_click insert failed", e instanceof Error ? e.message : e);
  }
  return NextResponse.redirect(dest, { status: 302, headers: { "Cache-Control": "no-store" } });
}
