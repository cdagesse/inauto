import "server-only";
import { del, list } from "@vercel/blob";
import { sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { purchases } from "@/db/schema";
import { env } from "@/env/server";
import { EVIDENCE_PREFIX, orphanedEvidence, referencedEvidence } from "@/lib/purchase/evidence";

/** A buyer may upload evidence, leave the form and come back; keep files this long. */
export const EVIDENCE_GRACE_MS = 2 * 86_400_000;

export interface EvidenceSweepSummary {
  scanned: number;
  deleted: number;
  skipped: string | null;
}

/**
 * Deletes evidence blobs under purchases/ that no purchase row references
 * and that are older than the grace period. Uploads land in Blob before the
 * purchase is submitted, so an abandoned form leaves a title scan behind
 * with nothing pointing at it; this is the only cleanup path.
 */
export async function sweepPurchaseEvidence(
  opts: {
    db?: Db;
    now?: Date;
    dryRun?: boolean;
    log?: (msg: string) => void;
  } = {},
): Promise<EvidenceSweepSummary> {
  const db = opts.db ?? defaultDb;
  const now = opts.now ?? new Date();
  const log = opts.log ?? (() => {});
  const token = env.BLOB_READ_WRITE_TOKEN;
  if (!token) return { scanned: 0, deleted: 0, skipped: "uploads not configured" };

  const rows = await db
    .select({
      p: sql<string | null>`${purchases.uploads}->>'titleFront'`,
      q: sql<string | null>`${purchases.uploads}->>'titleBack'`,
      r: sql<string | null>`${purchases.uploads}->>'ownershipVideo'`,
    })
    .from(purchases)
    .where(sql`${purchases.uploads} <> '{}'::jsonb`);
  // Rows written before uploads went private hold the public URL; list()
  // returns pathnames, so a legacy URL counts as a reference to its pathname.
  const referenced = referencedEvidence(rows.flatMap((row) => [row.p, row.q, row.r]));

  let scanned = 0;
  const orphans: string[] = [];
  let cursor: string | undefined;
  do {
    const page = await list({ prefix: EVIDENCE_PREFIX, cursor, limit: 1000, token });
    scanned += page.blobs.length;
    orphans.push(...orphanedEvidence(page.blobs, referenced, now, EVIDENCE_GRACE_MS));
    cursor = page.hasMore ? page.cursor : undefined;
  } while (cursor);

  if (opts.dryRun) {
    log(`evidence sweep: dry run, ${orphans.length} of ${scanned} blobs would be deleted`);
    return { scanned, deleted: 0, skipped: "dry run" };
  }
  for (let i = 0; i < orphans.length; i += 100) await del(orphans.slice(i, i + 100), { token });
  log(`evidence sweep: deleted ${orphans.length} of ${scanned} blobs`);
  return { scanned, deleted: orphans.length, skipped: null };
}
