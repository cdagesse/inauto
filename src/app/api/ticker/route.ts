import { NextResponse } from "next/server";
import { buildTicker } from "@/server/ticker";

export const runtime = "nodejs";
/** Rebuilt every 15 minutes, in step with the live auction sweep; served from the CDN between. */
export const revalidate = 900;

/** The market ticker's entries. Reads nothing from the request, so the response is cached. */
export async function GET() {
  const data = await buildTicker();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" },
  });
}
