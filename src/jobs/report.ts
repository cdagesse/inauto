import "server-only";
import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { auctionResults, dealerSales, makes, models } from "@/db/schema";
import { env } from "@/env/server";
import { runNightly, type NightlySummary } from "./nightly";

export interface ReportJobOptions {
  dryRun?: boolean;
  limit?: number;
  db?: Db;
  log?: (msg: string) => void;
}

export interface ReportJobResult {
  processed: { model: string; status: "ready" | "failed"; error?: string }[];
  runs: NightlySummary[];
}

const NO_DATA = "No data returned from sources (keys missing or dry run)";

async function hasData(db: Db, modelId: string): Promise<boolean> {
  const [d] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(dealerSales)
    .where(and(eq(dealerSales.modelId, modelId), isNull(dealerSales.excludedReason)));
  if ((d?.n ?? 0) > 0) return true;
  const [a] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(auctionResults)
    .where(and(eq(auctionResults.modelId, modelId), isNull(auctionResults.excludedReason)));
  return (a?.n ?? 0) > 0;
}

/**
 * Builds market reports for models a visitor asked for. Picks the oldest
 * `requested` models, marks each `building`, runs the pipeline for that one
 * model, then marks it `ready` if it now holds usable rows or `failed` otherwise.
 * Claims are atomic (UPDATE ... WHERE status='requested'), so overlapping cron
 * invocations never build the same model twice.
 */
export async function processReportRequests(opts: ReportJobOptions = {}): Promise<ReportJobResult> {
  const db = opts.db ?? defaultDb;
  const dryRun = opts.dryRun ?? env.jobsDryRun;
  const limit = Math.max(1, Math.min(opts.limit ?? 3, 10));
  const log = opts.log ?? ((m: string) => console.log(`[reports] ${m}`));
  const processed: ReportJobResult["processed"] = [];
  const runs: NightlySummary[] = [];

  const queue = await db
    .select({ id: models.id, slug: models.slug, makeSlug: makes.slug })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(eq(models.reportStatus, "requested"))
    .orderBy(asc(models.reportRequestedAt))
    .limit(limit);

  for (const m of queue) {
    const claimed = await db
      .update(models)
      .set({ reportStatus: "building", reportError: null })
      .where(and(eq(models.id, m.id), eq(models.reportStatus, "requested")))
      .returning({ id: models.id });
    if (claimed.length === 0) continue;
    const label = `${m.makeSlug}/${m.slug}`;
    log(`building ${label} ${dryRun ? "(dry run)" : "(LIVE)"}`);

    let error: string | undefined;
    try {
      const run = await runNightly({ dryRun, modelSlugs: [m.slug], log, db });
      runs.push(run);
      const modelErrors = run.errors.filter((e) => e.includes(label));
      if (modelErrors.length) error = modelErrors.join("; ");
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }

    const ready = await hasData(db, m.id);
    if (ready) {
      await db
        .update(models)
        .set({ reportStatus: "ready", reportBuiltAt: sql`now()`, reportError: null })
        .where(eq(models.id, m.id));
      processed.push({ model: label, status: "ready" });
    } else {
      const msg = (error ?? NO_DATA).slice(0, 500);
      await db
        .update(models)
        .set({ reportStatus: "failed", reportError: msg })
        .where(eq(models.id, m.id));
      processed.push({ model: label, status: "failed", error: msg });
    }
    log(`${label}: ${ready ? "ready" : "failed"}`);
  }
  return { processed, runs };
}
