import { get } from "@vercel/blob";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { env } from "@/env/server";
import {
  EVIDENCE_SLOTS,
  isEvidencePathname,
  isEvidenceSlot,
  isLegacyEvidenceUrl,
} from "@/lib/purchase/evidence";
import { getPurchaseForViewer } from "@/server/queries/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Streams one piece of purchase evidence (title front/back, ownership video)
 * from the private Blob prefix. Only the buyer and the seller can fetch it,
 * mirroring the bill-of-sale route. Stored pathnames are read with the
 * server token; a stored URL (rows from before uploads went private) is
 * redirected to, never fetched, so this can never act as a proxy.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string; slot: string }> }) {
  const { id, slot } = await ctx.params;
  if (!isEvidenceSlot(slot)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const p = await getPurchaseForViewer(id, session.user.id);
  if (!p) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const stored = p.purchase.uploads[EVIDENCE_SLOTS[slot]];
  if (!stored) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (isLegacyEvidenceUrl(stored))
    return NextResponse.redirect(stored, {
      status: 302,
      headers: { "Cache-Control": "private, no-store" },
    });
  if (!isEvidencePathname(stored) || !env.BLOB_READ_WRITE_TOKEN)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const blob = await get(stored, { access: "private", token: env.BLOB_READ_WRITE_TOKEN });
  if (!blob || blob.statusCode !== 200)
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  const name = stored.slice(stored.lastIndexOf("/") + 1);
  return new NextResponse(blob.stream, {
    headers: {
      "Content-Type": blob.blob.contentType || "application/octet-stream",
      "Content-Length": String(blob.blob.size),
      "Content-Disposition": `inline; filename="${name}"`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
