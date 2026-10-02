import { NextResponse } from "next/server";
import { buildTicker } from "@/server/ticker";

export const runtime = "nodejs";
/** Rebuilt every 15 minutes, in step with the live auction sweep; served from the CDN between. */
export const revalidate = 900;

/**
 * The market ticker's entries. Reads nothing from the request, so the response is prerendered
 * and revalidated on the timer above, and sooner when a sweep records new sales.
 */
export async function GET() {
  return NextResponse.json(await buildTicker());
}
