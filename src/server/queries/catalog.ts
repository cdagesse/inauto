import "server-only";
import { and, asc, desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { makes, models } from "@/db/schema";

export interface CatalogModelRow {
  id: string;
  make: string;
  makeSlug: string;
  model: string;
  modelSlug: string;
  shortName: string | null;
  parentLine: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  reportStatus: "none" | "requested" | "building" | "ready" | "failed";
  reportRequestedAt: Date | null;
  reportBuiltAt: Date | null;
  reportError: string | null;
}

const cols = {
  id: models.id,
  make: makes.name,
  makeSlug: makes.slug,
  model: models.name,
  modelSlug: models.slug,
  shortName: models.shortName,
  parentLine: models.parentLine,
  yearStart: models.yearStart,
  yearEnd: models.yearEnd,
  reportStatus: models.reportStatus,
  reportRequestedAt: models.reportRequestedAt,
  reportBuiltAt: models.reportBuiltAt,
  reportError: models.reportError,
};

export async function getCatalogModel(
  makeSlug: string,
  modelSlug: string,
): Promise<CatalogModelRow | null> {
  const [row] = await db
    .select(cols)
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(and(eq(makes.slug, makeSlug), eq(models.slug, modelSlug), eq(models.published, true)))
    .limit(1);
  return row ?? null;
}

const escapeLike = (s: string) => s.replace(/[%_\\]/g, (c) => `\\${c}`);

/** Typeahead search over makes and models. Every whitespace-separated term must match. */
export async function searchCatalog(q: string, limit = 8) {
  const terms = q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter(Boolean)
    .slice(0, 5);
  if (terms.length === 0) return { makes: [], models: [] };

  const makeRows = await db
    .select({ name: makes.name, slug: makes.slug })
    .from(makes)
    .where(
      or(
        ilike(makes.name, `%${escapeLike(terms.join(" "))}%`),
        ilike(makes.name, `%${escapeLike(terms[0]!)}%`),
      ),
    )
    .orderBy(asc(makes.name))
    .limit(4);

  const conditions = terms.map((t) => ilike(models.searchText, `%${escapeLike(t)}%`));
  // Rank: a model whose name IS the last term ("s63"), then one that starts with it,
  // then models that already have a report, then alphabetical.
  const last = terms[terms.length - 1]!.toLowerCase();
  const exact = sql`lower(${models.name}) = ${last}`;
  const prefix = sql`lower(${models.name}) like ${escapeLike(last) + "%"}`;
  const modelRows = await db
    .select({
      make: makes.name,
      makeSlug: makes.slug,
      model: models.name,
      modelSlug: models.slug,
      reportStatus: models.reportStatus,
    })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(and(eq(models.published, true), ...conditions))
    .orderBy(
      desc(exact),
      desc(prefix),
      desc(sql`${models.reportStatus} = 'ready'`),
      asc(makes.name),
      asc(models.name),
    )
    .limit(limit);

  return {
    makes: makeRows,
    models: modelRows.map((m) => ({
      ...m,
      ready: m.reportStatus === "ready",
      reportStatus: undefined,
    })),
  };
}
