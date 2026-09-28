/**
 * Pure scheduling rules for the source pulls, shared by the jobs and their tests.
 * Windows overlap on purpose: a repeated row is deduped on its source id, a missed row is lost.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** Sweeps stop at this share of the Old Cars Data plan so report builds keep the rest. */
export const OCD_SWEEP_SHARE = 0.8;
/** The nightly rotation stops at this share of the Visor cap so report builds keep the rest. */
export const VISOR_ROTATION_SHARE = 0.8;

/** Visor calls one night of the rotation may spend: the rotation's share spread over a month. */
export function visorNightAllowance(monthlyCap: number): number {
  return Math.max(4, Math.floor((monthlyCap * VISOR_ROTATION_SHARE) / 31));
}

/**
 * Live sweep: auctions updated since the last good run minus 30 minutes of overlap.
 * Never narrower than 45 minutes (one 15-minute cron gap plus the overlap) and never wider
 * than 36 hours (the walk is capped by pages; older gaps are for the backfill job).
 */
export function liveUpdatedSince(lastOk: Date | null, now: Date): Date {
  const narrowest = now.getTime() - 45 * MIN;
  const widest = now.getTime() - 36 * HOUR;
  const wanted = lastOk ? lastOk.getTime() - 30 * MIN : widest;
  return new Date(Math.max(widest, Math.min(narrowest, wanted)));
}

/**
 * Ended-results sweep: auctions that closed since the last good run minus 2 hours of
 * overlap, but always at least 2 days back, because some platforms post the result a day
 * or more after the auction ends and the walk is keyed on the end time. Never more than 3
 * days back. Repeats are free: results are inserted on conflict do nothing.
 */
export function endedSince(lastOk: Date | null, now: Date): Date {
  const narrowest = now.getTime() - 2 * DAY;
  const widest = now.getTime() - 3 * DAY;
  const wanted = lastOk ? lastOk.getTime() - 2 * HOUR : now.getTime() - 12 * HOUR;
  return new Date(Math.max(widest, Math.min(narrowest, wanted)));
}

export interface RotationModel {
  id: string;
  dealerPulledAt: Date | null;
}

export interface Rotation<T> {
  /** Models to pull tonight, stalest first. */
  slice: T[];
  /** Every eligible model, stalest first; a run walks it until perNight pulls succeed. */
  queue: T[];
  /** Successful pulls wanted per night. */
  perNight: number;
  /** Models whose last pull is older than the refresh interval. */
  overdue: number;
  /** Models skipped because they were pulled in the last day. */
  fresh: number;
}

/**
 * Which models the nightly refreshes from Visor: never-pulled models first, then the
 * oldest pulls, at most ceil(n / refreshDays) per night so the whole catalog turns over
 * about once per interval. Models pulled in the last day are left alone, so a manual
 * re-run never spends budget twice.
 */
export function pickRotation<T extends RotationModel>(
  models: T[],
  now: Date,
  refreshDays: number,
): Rotation<T> {
  const days = Math.max(1, Math.floor(refreshDays));
  const perNight = Math.max(1, Math.ceil(models.length / days));
  const dayAgo = now.getTime() - DAY;
  const eligible = models.filter((m) => !m.dealerPulledAt || m.dealerPulledAt.getTime() <= dayAgo);
  const stalest = [...eligible].sort(
    (a, b) => (a.dealerPulledAt?.getTime() ?? 0) - (b.dealerPulledAt?.getTime() ?? 0),
  );
  const cutoff = now.getTime() - days * DAY;
  return {
    slice: stalest.slice(0, perNight),
    queue: stalest,
    perNight,
    overdue: models.filter((m) => !m.dealerPulledAt || m.dealerPulledAt.getTime() < cutoff).length,
    fresh: models.length - eligible.length,
  };
}

/**
 * Visor `sold_within_days` for a model: the gap since its last pull plus a day of overlap,
 * at least the refresh interval plus one, at most 60. 0 means "never pulled": the caller
 * takes its first-build window instead.
 */
export function soldWindowDays(pulledAt: Date | null, now: Date, refreshDays: number): number {
  if (!pulledAt) return 0;
  const gap = Math.ceil((now.getTime() - pulledAt.getTime()) / DAY);
  return Math.min(60, Math.max(refreshDays + 1, gap + 1));
}
