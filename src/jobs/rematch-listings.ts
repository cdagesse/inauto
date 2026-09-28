import "server-only";
import { eq, isNull } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { externalListings } from "@/db/schema";
import { matchOcdRules } from "@/lib/sources/ocd";
import { assignGeneration } from "./lib/normalize";
import { loadCatalog } from "./live-auctions";

export const REMATCH_JOB = "rematch-listings";

export interface RematchSummary {
  startedAt: string;
  finishedAt: string;
  dryRun: boolean;
  /** Platform listings that had no catalog model. */
  scanned: number;
  /** Of those, how many the current aliases and matcher now place. */
  matched: number;
  /** Rows written (0 on a dry run). */
  updated: number;
  /** Matched rows per catalog model, largest first, capped. */
  byModel: { model: string; n: number }[];
  errors: string[];
}

const WRITE_CHUNK = 25;
const TOP_MODELS = 12;

/**
 * Re-runs catalog matching over platform listings that have no model. Run by hand after
 * an alias or matcher change: the live sweep re-matches live rows on its own, but sold and
 * ended rows are only rewritten here. Rows that still match nothing are left untouched.
 */
export async function rematchListings(opts: {
  db?: Db;
  dryRun: boolean;
  log?: (m: string) => void;
  now?: Date;
}): Promise<RematchSummary> {
  const db = opts.db ?? defaultDb;
  const log = opts.log ?? (() => {});
  const startedAt = (opts.now ?? new Date()).toISOString();
  const errors: string[] = [];
  const { rules, byId } = await loadCatalog(db);
  const rows = await db
    .select({
      id: externalListings.id,
      make: externalListings.make,
      model: externalListings.model,
      title: externalListings.title,
      year: externalListings.year,
    })
    .from(externalListings)
    .where(isNull(externalListings.modelId));
  log(`rematch: ${rows.length} unmatched listings, ${rules.length} rules`);

  const updates: { id: string; modelId: string; generationId: string | null }[] = [];
  const perModel = new Map<string, number>();
  for (const r of rows) {
    const modelId = matchOcdRules(
      rules,
      { rawMake: r.make, rawModel: r.model, title: r.title, year: r.year },
      (id) => byId.get(id)?.years,
    );
    if (!modelId) continue;
    const m = byId.get(modelId);
    const generationId =
      m && m.gens.length > 0 ? assignGeneration(m.gens, r.year, r.title).generationId : null;
    updates.push({ id: r.id, modelId, generationId });
    perModel.set(modelId, (perModel.get(modelId) ?? 0) + 1);
  }

  let updated = 0;
  if (!opts.dryRun) {
    for (let i = 0; i < updates.length; i += WRITE_CHUNK) {
      const slice = updates.slice(i, i + WRITE_CHUNK);
      const results = await Promise.allSettled(
        slice.map((u) =>
          db
            .update(externalListings)
            .set({ modelId: u.modelId, generationId: u.generationId })
            .where(eq(externalListings.id, u.id)),
        ),
      );
      let failed = 0;
      for (const r of results) {
        if (r.status === "fulfilled") updated++;
        else {
          failed++;
          if (errors.length < 10)
            errors.push(r.reason instanceof Error ? r.reason.message : String(r.reason));
        }
      }
      // A whole slice failing means the database is away; stop rather than hammer it.
      if (failed === slice.length) break;
    }
  }
  const byModel = [...perModel.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_MODELS)
    .map(([model, n]) => ({ model, n }));
  log(`rematch: matched ${updates.length}, wrote ${updated}`);
  return {
    startedAt,
    finishedAt: new Date().toISOString(),
    dryRun: opts.dryRun,
    scanned: rows.length,
    matched: updates.length,
    updated,
    byModel,
    errors,
  };
}
