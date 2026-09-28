import "server-only";
import { and, asc, count, eq, isNotNull, sql } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { externalListings, generations, listings, makes, models, users } from "@/db/schema";

export interface SellMake {
  name: string;
  slug: string;
}

export interface SellGeneration {
  code: string;
  name: string;
  yearStart: number;
  yearEnd: number;
}

export interface SellModel {
  name: string;
  slug: string;
  shortName: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  /** true when a market report with data exists for the model. */
  ready: boolean;
  generations: SellGeneration[];
}

/** Every make that has at least one published model, alphabetical. */
export const listSellMakes = cache(async (): Promise<SellMake[]> => {
  const rows = await db
    .selectDistinct({ name: makes.name, slug: makes.slug })
    .from(makes)
    .innerJoin(models, eq(models.makeId, makes.id))
    .where(eq(models.published, true))
    .orderBy(asc(makes.name));
  return rows;
});

/** Published models of a make with their generations, for the sell picker. */
export async function listSellModels(makeSlug: string): Promise<SellModel[]> {
  const rows = await db
    .select({
      id: models.id,
      name: models.name,
      slug: models.slug,
      shortName: models.shortName,
      yearStart: models.yearStart,
      yearEnd: models.yearEnd,
      reportStatus: models.reportStatus,
    })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(and(eq(makes.slug, makeSlug), eq(models.published, true)))
    .orderBy(asc(models.name));
  const published = rows;
  if (published.length === 0) return [];
  const gens = await db
    .select({
      modelId: generations.modelId,
      code: generations.code,
      name: generations.name,
      yearStart: generations.yearStart,
      yearEnd: generations.yearEnd,
      sortOrder: generations.sortOrder,
    })
    .from(generations)
    .innerJoin(models, eq(models.id, generations.modelId))
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(eq(makes.slug, makeSlug))
    .orderBy(asc(generations.sortOrder), asc(generations.yearStart));
  const byModel = new Map<string, SellGeneration[]>();
  for (const g of gens) {
    const list = byModel.get(g.modelId) ?? [];
    list.push({ code: g.code, name: g.name, yearStart: g.yearStart, yearEnd: g.yearEnd });
    byModel.set(g.modelId, list);
  }
  return published.map((r) => ({
    name: r.name,
    slug: r.slug,
    shortName: r.shortName,
    yearStart: r.yearStart,
    yearEnd: r.yearEnd,
    ready: r.reportStatus === "ready",
    generations: byModel.get(r.id) ?? [],
  }));
}

export interface TrimOption {
  name: string;
  count: number;
}

/**
 * Trims seen on the market for a model, most common first: platform auctions matched
 * to the model plus UrCar listings of the same make and model. Feeds the drawer's Trim
 * select; the filter itself still matches the trim or the listing title.
 */
export async function listTrims(makeSlug: string, modelSlug: string): Promise<TrimOption[]> {
  const [m] = await db
    .select({ id: models.id, name: models.name, makeName: makes.name })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(and(eq(makes.slug, makeSlug), eq(models.slug, modelSlug)))
    .limit(1);
  if (!m) return [];
  const [ext, own] = await Promise.all([
    db
      .select({ name: externalListings.trim, n: count() })
      .from(externalListings)
      .where(and(eq(externalListings.modelId, m.id), isNotNull(externalListings.trim)))
      .groupBy(externalListings.trim),
    db
      .select({ name: listings.trim, n: count() })
      .from(listings)
      // Only cars the public Buy page shows: active, not private-network, seller in good standing.
      .where(
        and(
          sql`lower(${listings.make}) = ${m.makeName.toLowerCase()}`,
          sql`lower(${listings.model}) = ${m.name.toLowerCase()}`,
          isNotNull(listings.trim),
          eq(listings.status, "active"),
          sql`${listings.type} <> 'private'`,
          sql`${listings.sellerId} in (select ${users.id} from ${users} where ${users.status} = 'active')`,
        ),
      )
      .groupBy(listings.trim),
  ]);
  const byKey = new Map<string, TrimOption>();
  for (const r of [...ext, ...own]) {
    const name = (r.name ?? "").trim();
    if (!name) continue;
    const key = name.toLowerCase();
    const cur = byKey.get(key);
    if (cur) cur.count += Number(r.n);
    else byKey.set(key, { name, count: Number(r.n) });
  }
  return [...byKey.values()]
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, 40);
}
