/**
 * Pure helpers for third-party live auction listings. No DB, no env, unit-testable.
 */
import { resolvePlatform } from "./platforms";

export type ExternalStatus = "live" | "sold" | "rnm" | "withdrawn" | "ended";

/** A live listing's status once its end time has passed but no result is known yet. */
export function liveStatusFor(
  current: ExternalStatus,
  endsAt: Date | null,
  now: Date,
): ExternalStatus {
  if (current !== "live") return current;
  if (endsAt && endsAt.getTime() < now.getTime()) return "ended";
  return current;
}

export interface ReconcileExternal {
  source: string; // platform key
  sourceName: string;
  sourceId: string;
  status: ExternalStatus;
}
export interface ReconcileResult {
  source: string; // platform name as stored on auction_result
  sourceId: string;
  status: "sold" | "rnm" | "withdrawn";
  hammerPrice: number | null;
}

/**
 * Decide whether a nightly auction result settles an external listing.
 * Returns the new status + final price, or null when the result does not
 * belong to this listing or the listing is already settled.
 */
export function reconcileDecision(
  ext: ReconcileExternal,
  result: ReconcileResult,
): { status: "sold" | "rnm" | "withdrawn"; finalPrice: number | null } | null {
  if (ext.status === "sold" || ext.status === "rnm" || ext.status === "withdrawn") return null;
  if (ext.sourceId !== result.sourceId) return null;
  const sameName = norm(ext.sourceName) === norm(result.source);
  const sameKey = resolvePlatform(null, result.source).key === ext.source;
  if (!sameName && !sameKey) return null;
  return { status: result.status, finalPrice: result.hammerPrice };
}

function norm(s: string | null | undefined) {
  return (s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** "Current bid is 12% under our market value" style copy. Pure, for the detail page. */
export function bidDelta(bid: number | null | undefined, marketValue: number | null | undefined) {
  if (bid == null || bid <= 0 || marketValue == null || marketValue <= 0) return null;
  const pct = (bid - marketValue) / marketValue;
  const abs = Math.abs(Math.round(pct * 100));
  const direction = pct < -0.005 ? "under" : pct > 0.005 ? "over" : "at";
  const text =
    direction === "at"
      ? "Current bid is right at our market value"
      : `Current bid is ${abs}% ${direction} our market value`;
  return { pct, direction, text } as const;
}

/** Only the last 6 of a VIN, for display on pages that are not ours to publish in full. */
export function maskVin(vin: string | null | undefined): string | null {
  if (!vin) return null;
  const v = vin.trim();
  return v.length <= 6 ? v : `${"•".repeat(Math.max(0, v.length - 6))}${v.slice(-6)}`;
}
