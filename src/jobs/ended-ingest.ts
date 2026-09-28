import "server-only";
import type { Db } from "@/db";
import { auctionResults } from "@/db/schema";
import { matchOcdRules, normalizeLiveRow, type NormalizedLiveRow } from "@/lib/sources/ocd";
import type { NormalizedAuctionRow } from "@/lib/sources/types";
import { assignGeneration, detectPackages, type AliasRule } from "./lib/normalize";
import { type CatalogModel, upsertExternalRows } from "./live-auctions";

/** An ended /auctions row re-read as an external listing row, with the settled status and hammer. */
export function endedToExternal(r: NormalizedAuctionRow, now: Date): NormalizedLiveRow | null {
  const live = normalizeLiveRow(r.raw, now);
  if (!live) return null;
  return {
    ...live,
    status: r.status,
    currentBid: r.hammerPrice ?? live.currentBid,
    endsAt: r.endedAt ?? live.endsAt,
    vin: r.vin ?? live.vin,
    year: r.year ?? live.year,
    miles: r.miles ?? live.miles,
  };
}

export function toAuctionInsert(m: CatalogModel, r: NormalizedAuctionRow) {
  // Including the catch-all generation, as the nightly does, so the row is not left ungrouped.
  const g = assignGeneration(m.allGens, r.year, r.title);
  return {
    source: r.source,
    sourceId: r.sourceId,
    url: r.url,
    vin: r.vin,
    generationId: g.generationId,
    modelId: m.id,
    year: r.year,
    miles: r.miles,
    hammerPrice: r.hammerPrice,
    status: r.status,
    endedAt: r.endedAt ? new Date(r.endedAt) : null,
    packages: detectPackages(r.title),
    needsReview: g.needsReview || r.needsReview,
    rawJson: r.raw as object,
  };
}

export interface EndedIngest {
  upserted: number;
  matched: number;
  auctionResultsInserted: number;
}

/**
 * Ended auctions into external_listing (the Buy page's Past view, with the settled status
 * and hammer) and, for vehicles of models that have or are building a report, into
 * auction_result (market data). Models without a report get theirs on the first build,
 * which keeps the snapshot pass bounded to models people asked for. Shared by the 6-hourly
 * sweep and the by-hand backfill. Duplicates are skipped on the unique source + id indexes,
 * so overlapping windows are safe.
 */
export async function ingestEndedAuctions(
  db: Db,
  rows: NormalizedAuctionRow[],
  rules: AliasRule[],
  byId: Map<string, CatalogModel>,
  now: Date,
): Promise<EndedIngest> {
  const inserts: ReturnType<typeof toAuctionInsert>[] = [];
  const external = new Map<string, NormalizedLiveRow>();
  for (const r of rows) {
    const modelId = matchOcdRules(
      rules,
      { rawMake: r.rawMake, rawModel: r.rawModel, title: r.title, year: r.year },
      (id) => byId.get(id)?.years,
    );
    const m = modelId ? byId.get(modelId) : null;
    if (m && (m.reportStatus === "ready" || m.reportStatus === "building"))
      inserts.push(toAuctionInsert(m, r));
    const ext = endedToExternal(r, now);
    if (ext) external.set(`${ext.source}|${ext.sourceId}`, ext);
  }
  let auctionResultsInserted = 0;
  for (let i = 0; i < inserts.length; i += 200) {
    const res = await db
      .insert(auctionResults)
      .values(inserts.slice(i, i + 200))
      .onConflictDoNothing({ target: [auctionResults.source, auctionResults.sourceId] })
      .returning({ id: auctionResults.id });
    auctionResultsInserted += res.length;
  }
  const u = await upsertExternalRows(db, [...external.values()], rules, byId);
  return { upserted: u.upserted, matched: u.matched, auctionResultsInserted };
}
