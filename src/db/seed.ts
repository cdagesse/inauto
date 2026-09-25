import "@/env/load";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import postgres from "postgres";
import * as schema from "./schema";
import { DEFAULT_CONFIG } from "@/lib/valuation/config";
import type { MarketSnapshot } from "@/lib/market/types";
import fixture from "@/data/fixtures/porsche-911-gt3-rs.json";

/**
 * Idempotent seed: catalog for the Porsche 911 GT3 RS, source aliases,
 * valuation config defaults, and the frozen fixture's dealer and auction rows.
 * Safe to re-run; every insert is an upsert on its natural key.
 */
async function main() {
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const client = postgres(url, { max: 1 });
  const db = drizzle(client, { schema });
  const snap = fixture as unknown as MarketSnapshot;

  try {
    const [make] = await db
      .insert(schema.makes)
      .values({ name: snap.make.name, slug: snap.make.slug })
      .onConflictDoUpdate({ target: schema.makes.slug, set: { name: snap.make.name } })
      .returning();

    const [model] = await db
      .insert(schema.models)
      .values({
        makeId: make.id,
        name: snap.model.name,
        slug: snap.model.slug,
        shortName: snap.model.shortName,
        published: true,
      })
      .onConflictDoUpdate({
        target: [schema.models.makeId, schema.models.slug],
        set: { name: snap.model.name, shortName: snap.model.shortName, published: true },
      })
      .returning();

    const genIds = new Map<string, string>();
    for (const [i, code] of snap.order.entries()) {
      const g = snap.generations[code];
      const yrs = snap.years[code] ?? [];
      const values = {
        modelId: model.id,
        code,
        name: g.name,
        yearStart: Math.min(...yrs),
        yearEnd: Math.max(...yrs),
        originalMsrp: g.msrp,
        engine: g.engine,
        hp: g.hp,
        gearbox: g.gearbox,
        notes: g.extra,
        packages: g.packages,
        sortOrder: i,
      };
      const [row] = await db
        .insert(schema.generations)
        .values(values)
        .onConflictDoUpdate({
          target: [schema.generations.modelId, schema.generations.code],
          set: values,
        })
        .returning();
      genIds.set(code, row.id);
    }

    // Source aliases (delete-and-insert; the table has no natural unique key).
    await db.delete(schema.modelAliases).where(sql`${schema.modelAliases.modelId} = ${model.id}`);
    await db.insert(schema.modelAliases).values([
      {
        modelId: model.id,
        source: "visor",
        rawMake: "Porsche",
        rawModel: "911",
        rawTrimPattern: "%GT3 RS%",
      },
      {
        modelId: model.id,
        source: "ocd",
        rawMake: "Porsche",
        rawModel: "911 GT3 RS",
        rawTrimPattern: null,
      },
    ]);

    // Valuation config defaults (global scope). Existing rows keep their tuned values.
    await db
      .insert(schema.valuationConfig)
      .values(
        Object.entries(DEFAULT_CONFIG).map(([key, value]) => ({
          key,
          scope: "global",
          value: String(value),
        })),
      )
      .onConflictDoNothing();

    // Fixture dealer sales.
    const dealerRows = Object.entries(snap.dealerSales).flatMap(([code, pts]) =>
      pts.map((p, i) => ({
        sourceListingId: `fx-${code}-${i}`,
        modelId: model.id,
        generationId: genIds.get(code) ?? null,
        year: Math.min(...(snap.years[code] ?? [0])),
        miles: p.miles,
        price: p.price,
        soldDate: snap.dataThrough,
        rawJson: { fixture: true },
      })),
    );
    for (let i = 0; i < dealerRows.length; i += 200) {
      await db
        .insert(schema.dealerSales)
        .values(dealerRows.slice(i, i + 200))
        .onConflictDoUpdate({
          target: schema.dealerSales.sourceListingId,
          set: {
            price: sql`excluded.price`,
            miles: sql`excluded.miles`,
            generationId: sql`excluded.generation_id`,
          },
        });
    }

    // Fixture auction results.
    const auctionRows = snap.auctions.map((a) => ({
      source: a.platform,
      sourceId: a.id,
      url: a.url,
      modelId: model.id,
      generationId: genIds.get(a.generation) ?? null,
      year: a.year,
      miles: a.miles,
      hammerPrice: a.price,
      status: a.status,
      endedAt: new Date(`${a.endedAt}T00:00:00Z`),
      packages: a.weissach ? ["weissach"] : [],
      rawJson: { fixture: true },
    }));
    await db
      .insert(schema.auctionResults)
      .values(auctionRows)
      .onConflictDoUpdate({
        target: [schema.auctionResults.source, schema.auctionResults.sourceId],
        set: {
          hammerPrice: sql`excluded.hammer_price`,
          status: sql`excluded.status`,
          generationId: sql`excluded.generation_id`,
        },
      });

    console.log(
      `seeded ${snap.make.name} ${snap.model.name}: ${genIds.size} generations, ${dealerRows.length} dealer sales, ${auctionRows.length} auction results, ${Object.keys(DEFAULT_CONFIG).length} config keys`,
    );
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
