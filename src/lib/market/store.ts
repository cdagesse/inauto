import "server-only";
import { eq, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { makes, marketSnapshots, models } from "@/db/schema";
import { buildSnapshot } from "./build";
import { listModelsWithData, loadSnapshotInput } from "./queries";
import type { MarketSnapshot } from "./types";

/** The slim part of a snapshot the Markets drill-down aggregates. */
export type MarketSummarySnapshot = Pick<
  MarketSnapshot,
  "make" | "model" | "dataThrough" | "totals" | "order" | "generations" | "monthly"
>;

export function summarize(s: MarketSnapshot): MarketSummarySnapshot {
  return {
    make: s.make,
    model: s.model,
    dataThrough: s.dataThrough,
    totals: s.totals,
    order: s.order,
    generations: s.generations,
    monthly: s.monthly,
  };
}

async function modelIdFor(db: Db, makeSlug: string, modelSlug: string) {
  const [row] = await db
    .select({ id: models.id })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(sql`${makes.slug} = ${makeSlug} and ${models.slug} = ${modelSlug}`)
    .limit(1);
  return row?.id ?? null;
}

/** Stored snapshot for a model, or null when none has been built yet. */
export async function loadStoredSnapshot(
  makeSlug: string,
  modelSlug: string,
  db: Db = defaultDb,
): Promise<MarketSnapshot | null> {
  const [row] = await db
    .select({ snapshot: marketSnapshots.snapshot })
    .from(marketSnapshots)
    .innerJoin(models, eq(models.id, marketSnapshots.modelId))
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(sql`${makes.slug} = ${makeSlug} and ${models.slug} = ${modelSlug}`)
    .limit(1);
  return (row?.snapshot as MarketSnapshot | undefined) ?? null;
}

/** All stored summaries, for the Markets drill-down. */
export async function loadStoredSummaries(db: Db = defaultDb): Promise<MarketSummarySnapshot[]> {
  const rows = await db.select({ summary: marketSnapshots.summary }).from(marketSnapshots);
  return rows.map((r) => r.summary as MarketSummarySnapshot);
}

/** Builds one model's snapshot from the raw rows and stores it. Returns null when it has no data. */
export async function rebuildSnapshot(
  makeSlug: string,
  modelSlug: string,
  db: Db = defaultDb,
  now = new Date(),
): Promise<MarketSnapshot | null> {
  const input = await loadSnapshotInput(makeSlug, modelSlug, now);
  if (!input) return null;
  const snapshot = buildSnapshot(input);
  const modelId = await modelIdFor(db, makeSlug, modelSlug);
  if (modelId) {
    try {
      await db
        .insert(marketSnapshots)
        .values({
          modelId,
          builtAt: now,
          dataThrough: snapshot.dataThrough,
          summary: summarize(snapshot),
          snapshot,
        })
        .onConflictDoUpdate({
          target: marketSnapshots.modelId,
          set: {
            builtAt: now,
            dataThrough: snapshot.dataThrough,
            summary: summarize(snapshot),
            snapshot,
          },
        });
    } catch (err) {
      console.warn(
        `market snapshot: store write failed for ${makeSlug}/${modelSlug}`,
        (err as Error).message,
      );
    }
  }
  return snapshot;
}

/** Rebuilds every model that has data. Called by the nightly job after the pull. */
export async function rebuildAllSnapshots(
  db: Db = defaultDb,
  log: (m: string) => void = () => {},
  now = new Date(),
): Promise<{ built: number; failed: string[] }> {
  const keys = await listModelsWithData();
  let built = 0;
  const failed: string[] = [];
  for (const k of keys) {
    try {
      if (await rebuildSnapshot(k.makeSlug, k.modelSlug, db, now)) built++;
    } catch (e) {
      failed.push(`${k.makeSlug}/${k.modelSlug}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  log(
    `snapshots: rebuilt ${built} of ${keys.length}${failed.length ? `, ${failed.length} failed` : ""}`,
  );
  return { built, failed };
}
