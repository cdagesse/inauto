import { sql } from "drizzle-orm";
import type { Db } from "@/db";
import { apiBudgets, rawFetches } from "@/db/schema";
import type { CallRecorder, SourceCallMeta } from "./types";

export class BudgetExceeded extends Error {
  constructor(
    public readonly source: string,
    public readonly used: number,
    public readonly cap: number,
  ) {
    super(`${source} monthly API budget reached (${used}/${cap})`);
    this.name = "BudgetExceeded";
  }
}

export function currentMonth(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

function firstRow<T>(rows: unknown): T | undefined {
  if (Array.isArray(rows)) return rows[0] as T;
  return (rows as { rows?: T[] } | undefined)?.rows?.[0];
}

/**
 * Reserve one call against the monthly budget. A single
 * INSERT ... ON CONFLICT DO UPDATE ... WHERE calls_used < cap ... RETURNING, so two job
 * instances racing for the last unit cannot both get it. Throws BudgetExceeded when the
 * cap is reached; the counter is not incremented in that case.
 */
export async function reserveCall(
  db: Db,
  source: string,
  cap: number,
  now = new Date(),
): Promise<number> {
  const month = currentMonth(now);
  const rows = await db.execute(sql`
    INSERT INTO ${apiBudgets} (source, month, calls_used)
    VALUES (${source}, ${month}, 1)
    ON CONFLICT (source, month) DO UPDATE
      SET calls_used = ${apiBudgets}.calls_used + 1, updated_at = now()
      WHERE ${apiBudgets}.calls_used < ${cap}
    RETURNING calls_used
  `);
  const row = firstRow<{ calls_used: number | string }>(rows);
  if (!row) throw new BudgetExceeded(source, cap, cap);
  return Number(row.calls_used);
}

export async function callsUsed(db: Db, source: string, now = new Date()): Promise<number> {
  const rows = await db.execute(sql`
    SELECT calls_used FROM ${apiBudgets} WHERE source = ${source} AND month = ${currentMonth(now)}
  `);
  const row = firstRow<{ calls_used: number | string }>(rows);
  return row ? Number(row.calls_used) : 0;
}

/**
 * Build a CallRecorder bound to `source`: `reserve` takes one budget unit (or throws
 * BudgetExceeded), `record` persists the raw response so it can be reprocessed without
 * re-spending the call. A failed request still consumes its unit; that is the conservative choice.
 */
export function budgetedRecorder(
  db: Db,
  source: string,
  monthlyCap: number,
  log?: (m: string) => void,
): CallRecorder {
  return {
    async reserve(endpoint, opts) {
      if (opts?.free) {
        log?.(`${source} ${endpoint}: free endpoint, not counted`);
        return;
      }
      const used = await reserveCall(db, source, monthlyCap);
      log?.(`${source} ${endpoint}: budget ${used}/${monthlyCap}`);
    },
    async record(meta: SourceCallMeta) {
      await db.insert(rawFetches).values({
        source,
        endpoint: meta.endpoint,
        params: meta.params,
        status: meta.status,
        rateLimitHeaders: meta.rateLimit,
        body: meta.body as object,
        rowCount: meta.rowCount,
      });
      const rl = Object.entries(meta.rateLimit)
        .map(([k, v]) => `${k}=${v}`)
        .join(" ");
      log?.(
        `${source} ${meta.endpoint} -> ${meta.status}, ${meta.rowCount} rows${rl ? ` [${rl}]` : ""}`,
      );
    },
  };
}

/** Run `fn` with a budgeted recorder, refusing to start when the month's budget is spent. */
export async function withBudget<T>(
  db: Db,
  source: string,
  monthlyCap: number,
  fn: (record: CallRecorder) => Promise<T>,
  log?: (m: string) => void,
): Promise<T> {
  const used = await callsUsed(db, source);
  if (used >= monthlyCap) throw new BudgetExceeded(source, used, monthlyCap);
  return fn(budgetedRecorder(db, source, monthlyCap, log));
}
