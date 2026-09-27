/**
 * Display state for a platform auction. The sync marks a row "live" until the
 * platform reports a result, so a live row whose end time has passed is shown
 * as ended with the result pending, never as live. Pure, safe on the client.
 */
import type { ExternalStatus } from "./live";

export type { ExternalStatus };

export function effectiveStatus(
  status: ExternalStatus,
  endsAt: Date | string | null,
  now: number = Date.now(),
): ExternalStatus {
  if (status !== "live" || !endsAt) return status;
  const t = new Date(endsAt).getTime();
  return Number.isFinite(t) && t <= now ? "ended" : status;
}

/** Short outcome label for a settled auction. */
export function outcomeLabel(status: Exclude<ExternalStatus, "live">): string {
  switch (status) {
    case "sold":
      return "Sold";
    case "rnm":
      return "Not sold";
    case "withdrawn":
      return "Withdrawn";
    default:
      return "Result pending";
  }
}

/** Label for the price shown on a card. */
export function priceLabel(status: ExternalStatus, hasPrice: boolean): string {
  if (!hasPrice) return status === "live" ? "No bids yet" : "No result";
  switch (status) {
    case "live":
      return "current bid";
    case "sold":
      return "sold for";
    case "rnm":
      return "high bid, reserve not met";
    case "withdrawn":
      return "high bid, withdrawn";
    default:
      return "high bid";
  }
}
