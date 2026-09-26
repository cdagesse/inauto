import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { generations, makes, models } from "@/db/schema";

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
