/**
 * Pure scheduling rules for the source pulls, shared by the jobs and their tests.
 * Windows overlap on purpose: a repeated row is deduped on its source id, a missed row is lost.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/**
 * Live sweep: auctions updated since the last good run minus 30 minutes of overlap.
 * Never narrower than 2 hours (a missed cron tick or two costs nothing) and never wider
 * than 36 hours (the walk is capped by pages; older gaps are for the backfill job).
 */
export function liveUpdatedSince(lastOk: Date | null, now: Date): Date {
  const narrowest = now.getTime() - 2 * HOUR;
  const widest = now.getTime() - 36 * HOUR;
  const wanted = lastOk ? lastOk.getTime() - 30 * MIN : widest;
  return new Date(Math.max(widest, Math.min(narrowest, wanted)));
}

/**
 * Ended-results sweep: auctions that closed since the last good run minus 2 hours of
 * overlap; 12 hours on the first run; never more than 3 days back.
 */
export function endedSince(lastOk: Date | null, now: Date): Date {
  const narrowest = now.getTime() - 2 * HOUR;
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
