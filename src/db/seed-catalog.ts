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
  const makeIds = new Map<string, string>();
  for (const m of MAKES) {
    const [row] = await db
      .insert(schema.makes)
      .values({ name: m.name, slug: m.slug })
      .onConflictDoUpdate({ target: schema.makes.slug, set: { name: m.name } })
      .returning({ id: schema.makes.id });
    makeIds.set(m.slug, row!.id);
  }

  const modelIds = new Map<string, string>();
  for (const e of CATALOG) {
    const makeId = makeIds.get(e.makeSlug)!;
    const values = {
      makeId,
      name: e.model,
      slug: e.modelSlug,
      shortName: e.shortName ?? null,
      parentLine: e.parentLine ?? e.make,
      yearStart: e.yearStart,
      yearEnd: e.yearEnd,
      published: true,
      searchText: searchTextFor(e),
    };
    const [row] = await db
      .insert(schema.models)
      .values(values)
      .onConflictDoUpdate({
        target: [schema.models.makeId, schema.models.slug],
        set: {
          name: values.name,
          parentLine: values.parentLine,
          yearStart: values.yearStart,
          yearEnd: values.yearEnd,
          published: true,
          searchText: values.searchText,
          // Keep a curated shortName if one exists.
          shortName: sql`coalesce(${schema.models.shortName}, ${values.shortName})`,
        },
      })
      .returning({ id: schema.models.id });
    modelIds.set(`${e.makeSlug}/${e.modelSlug}`, row!.id);
  }

  const ids = [...modelIds.values()];
  // Aliases: one row per model per source, updated in place so a corrected catalog fixes
  // production rows on re-seed. (model_alias has no unique key; match on modelId + source.)
  const existingAliases = await db
    .select({
      id: schema.modelAliases.id,
      modelId: schema.modelAliases.modelId,
      source: schema.modelAliases.source,
    })
    .from(schema.modelAliases)
    .where(inArray(schema.modelAliases.modelId, ids));
  const aliasId = new Map(existingAliases.map((a) => [`${a.modelId}:${a.source}`, a.id]));
  const aliasRows: (typeof schema.modelAliases.$inferInsert)[] = [];
  for (const e of CATALOG) {
    const modelId = modelIds.get(`${e.makeSlug}/${e.modelSlug}`)!;
    const wanted: (typeof schema.modelAliases.$inferInsert)[] = [
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
    for (const w of wanted) {
      const id = aliasId.get(`${modelId}:${w.source}`);
      if (id) {
        await db
          .update(schema.modelAliases)
          .set({ rawMake: w.rawMake, rawModel: w.rawModel, rawTrimPattern: w.rawTrimPattern })
          .where(eq(schema.modelAliases.id, id));
      } else aliasRows.push(w);
    }
  }
  if (aliasRows.length) await db.insert(schema.modelAliases).values(aliasRows);

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
