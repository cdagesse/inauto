/** Pure retention helpers for the nightly job: how long each log table is kept and how deletes are batched. */

/** Days each append-only table is kept before the nightly job prunes it. */
export const RETENTION_DAYS = {
  /** Raw third-party responses; nothing reads them back and processed_at is never set. */
  rawFetch: 30,
  /** Per-car daily view counts; "trending" reads only the last 7 days. */
  carView: 90,
  /** Job summaries; the admin dashboard shows recent runs only. */
  jobRun: 90,
} as const;

/** Rows deleted per statement. Small enough that the first prune of a large backlog fits the cron cap. */
export const RETENTION_BATCH = 5000;

/** Batches per table per run; a backlog beyond this drains over the next nights. */
export const RETENTION_MAX_BATCHES = 20;

export interface PruneOptions {
  batch?: number;
  maxBatches?: number;
}

/**
 * Runs `deleteBatch(limit)` until it deletes fewer rows than `limit` or `maxBatches`
 * is reached. Returns the total deleted. `deleteBatch` should delete at most `limit`
 * rows and return how many it deleted.
 */
export async function pruneInBatches(
  deleteBatch: (limit: number) => Promise<number>,
  opts: PruneOptions = {},
): Promise<number> {
  const limit = Math.max(1, opts.batch ?? RETENTION_BATCH);
  const maxBatches = Math.max(1, opts.maxBatches ?? RETENTION_MAX_BATCHES);
  let total = 0;
  for (let i = 0; i < maxBatches; i++) {
    const n = await deleteBatch(limit);
    total += n;
    if (n < limit) break;
  }
  return total;
}
