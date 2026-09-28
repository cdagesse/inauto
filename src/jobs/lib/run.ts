import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@/db";
import { jobRuns } from "@/db/schema";

/** What a finished run writes back to its job_run row. */
export interface RunOutcome {
  ok: boolean;
  /** Rows written or items handled; 0 for a heartbeat that found nothing to do. */
  changed: number;
  summary: unknown;
  error?: string | null;
}

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

/**
 * Records one job_run row around `fn`: a row when the job starts, then ok, changed,
 * summary and error when it ends. If `fn` throws, the row is marked failed and the
 * error is rethrown. A failure to write the row itself is logged and never fails the job.
 */
export async function recordRun<T>(
  db: Db,
  name: string,
  opts: { dryRun: boolean; log?: (m: string) => void },
  fn: () => Promise<T>,
  outcome: (result: T) => RunOutcome,
): Promise<T> {
  const log = opts.log ?? ((m: string) => console.error(`[${name}] ${m}`));
  let id: string | null = null;
  try {
    const [row] = await db
      .insert(jobRuns)
      .values({ name, dryRun: opts.dryRun })
      .returning({ id: jobRuns.id });
    id = row?.id ?? null;
  } catch (e) {
    log(`job_run insert failed: ${message(e)}`);
  }
  const finish = async (patch: {
    ok: boolean;
    changed: number;
    summary?: unknown;
    error: string | null;
  }) => {
    if (!id) return;
    try {
      await db
        .update(jobRuns)
        .set({ finishedAt: new Date(), ...patch })
        .where(eq(jobRuns.id, id));
    } catch (e) {
      log(`job_run update failed: ${message(e)}`);
    }
  };

  let result: T;
  try {
    result = await fn();
  } catch (e) {
    await finish({ ok: false, changed: 0, error: message(e).slice(0, 2000) });
    throw e;
  }
  const o = outcome(result);
  await finish({
    ok: o.ok,
    changed: o.changed,
    summary: o.summary,
    error: o.error?.slice(0, 2000) ?? null,
  });
  return result;
}

/**
 * Start time of the newest live (not dry) run of `name` that finished ok, or null. Sweeps
 * size their window from it, so a run that pulled nothing must not be recorded ok.
 */
export async function lastGoodRun(db: Db, name: string): Promise<Date | null> {
  const [row] = await db
    .select({ startedAt: jobRuns.startedAt })
    .from(jobRuns)
    .where(and(eq(jobRuns.name, name), eq(jobRuns.ok, true), eq(jobRuns.dryRun, false)))
    .orderBy(desc(jobRuns.startedAt))
    .limit(1);
  return row?.startedAt ?? null;
}
