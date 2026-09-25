import { and, eq, inArray } from "drizzle-orm";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import fixture from "@/data/fixtures/porsche-911-gt3-rs.json";
import type { MarketSnapshot } from "@/lib/market/types";
import { resolvePlatform } from "@/lib/sources/platforms";
import * as schema from "./schema";

/**
 * Seeds external_listing with the fixture's 18 real, already-ended GT3 RS auctions
 * (real platform URLs and results) so the platform pages render. Live rows with
 * fabricated bids are never seeded unless SEED_DEMO_LIVE=true is set explicitly.
 * Idempotent: upserts on (source, source_id).
 */
export async function seedExternal(db: PostgresJsDatabase<typeof schema>): Promise<number> {
  const snap = fixture as unknown as MarketSnapshot;
  const [model] = await db
    .select({ id: schema.models.id })
    .from(schema.models)
    .innerJoin(schema.makes, eq(schema.makes.id, schema.models.makeId))
    .where(and(eq(schema.makes.slug, snap.make.slug), eq(schema.models.slug, snap.model.slug)))
    .limit(1);
  const gens = model
    ? await db.select().from(schema.generations).where(eq(schema.generations.modelId, model.id))
    : [];
  const genByCode = new Map(gens.map((g) => [g.code, g.id]));

  type Row = typeof schema.externalListings.$inferInsert;
  const rows: Row[] = snap.auctions.map((a): Row => {
    const p = resolvePlatform(a.url, a.platform);
    const endsAt = new Date(`${a.endedAt}T18:00:00Z`);
    return {
      source: p.key,
      sourceName: p.key === "other" ? a.platform : p.name,
      sourceId: `fixture:${a.id}`,
      url: a.url,
      status:
        a.status === "sold"
          ? ("sold" as const)
          : a.status === "rnm"
            ? ("rnm" as const)
            : ("withdrawn" as const),
      title: `${a.year} Porsche 911 GT3 RS${a.weissach ? " Weissach" : ""}`,
      make: "Porsche",
      model: "911 GT3 RS",
      year: a.year,
      trim: a.weissach ? "Weissach" : null,
      miles: a.miles,
      finalPrice: a.status === "sold" ? a.price : null,
      currentBid: a.price,
      bidCount: null,
      reserveMet: a.status === "sold" ? true : a.status === "rnm" ? false : null,
      startedAt: new Date(endsAt.getTime() - 7 * 86_400_000),
      endsAt,
      modelId: model?.id ?? null,
      generationId: genByCode.get(a.generation) ?? null,
      photoUrls: [] as string[],
      rawJson: { seeded: true, fixtureId: a.id },
    };
  });

  if (process.env.SEED_DEMO_LIVE === "true") {
    const day = 86_400_000;
    const now = Date.now();
    rows.push(
      ...[
        {
          id: "demo-live-1",
          title: "2024 Porsche 911 GT3 RS Weissach (DEMO)",
          year: 2024,
          miles: 1200,
          bid: 455_000,
          bids: 21,
          ends: 2 * day,
          gen: "992",
          weissach: true,
        },
        {
          id: "demo-live-2",
          title: "2019 Porsche 911 GT3 RS (DEMO)",
          year: 2019,
          miles: 8_900,
          bid: 231_000,
          bids: 14,
          ends: 4 * day,
          gen: "991.2",
          weissach: false,
        },
        {
          id: "demo-live-3",
          title: "2016 Porsche 911 GT3 RS (DEMO)",
          year: 2016,
          miles: 14_200,
          bid: 176_000,
          bids: 9,
          ends: 0.5 * day,
          gen: "991.1",
          weissach: false,
        },
      ].map((d): Row => ({
        source: "bat" as const,
        sourceName: "Bring a Trailer",
        sourceId: `demo:${d.id}`,
        url: "https://bringatrailer.com/porsche/991-gt3-rs/",
        status: "live" as const,
        title: d.title,
        make: "Porsche",
        model: "911 GT3 RS",
        year: d.year,
        trim: d.weissach ? "Weissach" : null,
        miles: d.miles,
        finalPrice: null,
        currentBid: d.bid,
        bidCount: d.bids,
        reserveMet: d.bids > 10,
        startedAt: new Date(now - 5 * day),
        endsAt: new Date(now + d.ends),
        modelId: model?.id ?? null,
        generationId: genByCode.get(d.gen) ?? null,
        photoUrls: [] as string[],
        rawJson: { seeded: true, demo: true },
      })),
    );
  } else {
    // Remove any demo rows left over from an earlier SEED_DEMO_LIVE run.
    const demoIds = ["demo:demo-live-1", "demo:demo-live-2", "demo:demo-live-3"];
    await db
      .delete(schema.externalListings)
      .where(
        and(
          eq(schema.externalListings.source, "bat"),
          inArray(schema.externalListings.sourceId, demoIds),
        ),
      );
  }

  for (const r of rows) {
    await db
      .insert(schema.externalListings)
      .values(r)
      .onConflictDoUpdate({
        target: [schema.externalListings.source, schema.externalListings.sourceId],
        set: {
          status: r.status,
          title: r.title,
          currentBid: r.currentBid,
          bidCount: r.bidCount,
          finalPrice: r.finalPrice,
          reserveMet: r.reserveMet,
          endsAt: r.endsAt,
          modelId: r.modelId,
          generationId: r.generationId,
          fetchedAt: new Date(),
        },
      });
  }
  return rows.length;
}
