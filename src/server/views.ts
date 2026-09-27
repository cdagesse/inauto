import "server-only";
import { sql } from "drizzle-orm";
import { db } from "@/db";
import { carViews } from "@/db/schema";

export type ViewKind = "listing" | "external";

/** Bumps today's view count for a car. Never throws: a failed count must not break a page. */
export async function recordCarView(kind: ViewKind, refId: string): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO ${carViews} (kind, ref_id, day, views)
      VALUES (${kind}, ${refId}, current_date, 1)
      ON CONFLICT (kind, ref_id, day) DO UPDATE SET views = ${carViews}.views + 1
    `);
  } catch (e) {
    console.warn("view count failed", e instanceof Error ? e.message : e);
  }
}

/** Most-viewed cars over the last `days` days: [{kind, refId, views}], highest first. */
export async function topViewed(days = 7, limit = 8) {
  const rows = await db.execute(sql`
    SELECT kind, ref_id AS "refId", sum(views)::int AS views
    FROM ${carViews}
    WHERE day >= current_date - ${days}::int
    GROUP BY kind, ref_id
    ORDER BY views DESC
    LIMIT ${limit}
  `);
  const list = (Array.isArray(rows) ? rows : ((rows as { rows?: unknown[] }).rows ?? [])) as {
    kind: ViewKind;
    refId: string;
    views: number | string;
  }[];
  return list.map((r) => ({ kind: r.kind, refId: r.refId, views: Number(r.views) }));
}
