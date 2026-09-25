import { and, eq, inArray, sql } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import * as schema from "./schema";
import { CATALOG, MAKES, searchTextFor } from "@/data/catalog";
import { encodeOcdKeyword } from "@/lib/sources/ocd";

type Db = PostgresJsDatabase<typeof schema>;

/**
 * Idempotent seed of the searchable make/model catalog: makes, models (with
 * search text), source aliases, and one "all years" generation for any model
 * that has none yet. Curated generations (e.g. the GT3 RS) are never touched.
 */
export async function seedCatalog(
  db: Db,
): Promise<{ makes: number; models: number; generations: number }> {
  // One multi-row upsert per table: the seed runs against Neon over the network,
  // so per-row round trips would take minutes.
  const makeIds = new Map<string, string>();
  const makeRows = await db
    .insert(schema.makes)
    .values(MAKES.map((m) => ({ name: m.name, slug: m.slug })))
    .onConflictDoUpdate({ target: schema.makes.slug, set: { name: sql`excluded.name` } })
    .returning({ id: schema.makes.id, slug: schema.makes.slug });
  for (const r of makeRows) makeIds.set(r.slug, r.id);

  const modelIds = new Map<string, string>();
  const modelValues = CATALOG.map((e) => ({
    makeId: makeIds.get(e.makeSlug)!,
    name: e.model,
    slug: e.modelSlug,
    shortName: e.shortName ?? null,
    parentLine: e.parentLine ?? e.make,
    yearStart: e.yearStart,
    yearEnd: e.yearEnd,
    published: true,
    searchText: searchTextFor(e),
  }));
  const slugByMakeId = new Map(MAKES.map((m) => [makeIds.get(m.slug)!, m.slug]));
  for (let i = 0; i < modelValues.length; i += 200) {
    const rows = await db
      .insert(schema.models)
      .values(modelValues.slice(i, i + 200))
      .onConflictDoUpdate({
        target: [schema.models.makeId, schema.models.slug],
        set: {
          name: sql`excluded.name`,
          parentLine: sql`excluded.parent_line`,
          yearStart: sql`excluded.year_start`,
          yearEnd: sql`excluded.year_end`,
          published: true,
          searchText: sql`excluded.search_text`,
          // Keep a curated shortName if one exists.
          shortName: sql`coalesce(${schema.models.shortName}, excluded.short_name)`,
        },
      })
      .returning({ id: schema.models.id, makeId: schema.models.makeId, slug: schema.models.slug });
    for (const r of rows) modelIds.set(`${slugByMakeId.get(r.makeId)}/${r.slug}`, r.id);
  }

  const ids = [...modelIds.values()];

  // Aliases are fully owned by the catalog: replace them for catalog models in two statements.
  const aliasRows: (typeof schema.modelAliases.$inferInsert)[] = CATALOG.flatMap((e) => {
    const modelId = modelIds.get(`${e.makeSlug}/${e.modelSlug}`)!;
    return [
      {
        modelId,
        source: "visor",
        rawMake: e.aliases.visor.make,
        rawModel: e.aliases.visor.model,
        rawTrimPattern: e.aliases.visor.trimPattern ?? null,
      },
      {
        modelId,
        source: "ocd",
        rawMake: e.aliases.ocd.make,
        // "" = no OCD line: the job searches the whole make by keyword and year range.
        rawModel: e.aliases.ocd.lineUnverified ? "" : e.aliases.ocd.model,
        rawTrimPattern: encodeOcdKeyword(e.aliases.ocd.keyword, e.aliases.ocd.excludeKeyword),
      },
    ];
  });
  await db
    .delete(schema.modelAliases)
    .where(
      and(
        inArray(schema.modelAliases.modelId, ids),
        inArray(schema.modelAliases.source, ["visor", "ocd"]),
      ),
    );
  for (let i = 0; i < aliasRows.length; i += 400) {
    await db.insert(schema.modelAliases).values(aliasRows.slice(i, i + 400));
  }

  const withGens = new Set(
    (
      await db
        .selectDistinct({ modelId: schema.generations.modelId })
        .from(schema.generations)
        .where(inArray(schema.generations.modelId, ids))
    ).map((g) => g.modelId),
  );
  const year = new Date().getUTCFullYear();
  const genRows = CATALOG.filter(
    (e) => !withGens.has(modelIds.get(`${e.makeSlug}/${e.modelSlug}`)!),
  ).map((e) => ({
    modelId: modelIds.get(`${e.makeSlug}/${e.modelSlug}`)!,
    code: "all",
    name: "All years",
    yearStart: e.yearStart,
    yearEnd: e.yearEnd ?? year,
    sortOrder: 0,
  }));
  if (genRows.length) {
    await db
      .insert(schema.generations)
      .values(genRows)
      .onConflictDoNothing({ target: [schema.generations.modelId, schema.generations.code] });
  }

  // Sanity: models that hold market rows are "ready" even if the flag was never set.
  await db
    .update(schema.models)
    .set({
      reportStatus: "ready",
      reportBuiltAt: sql`coalesce(${schema.models.reportBuiltAt}, now())`,
    })
    .where(
      and(
        eq(schema.models.reportStatus, "none"),
        sql`exists (select 1 from dealer_sale d where d.model_id = ${schema.models.id} and d.excluded_reason is null)`,
      ),
    );

  return { makes: makeIds.size, models: modelIds.size, generations: genRows.length };
}
