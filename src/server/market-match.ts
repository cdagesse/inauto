import "server-only";
import { eq, ilike, or } from "drizzle-orm";
import { cache } from "react";
import { db } from "@/db";
import { makes, models } from "@/db/schema";
import { getMarketSnapshot } from "@/lib/market/source";
import type { MarketSnapshot } from "@/lib/market/types";
import { slugify } from "./result";

export interface MarketMatch {
  snapshot: MarketSnapshot;
  generation: string | null;
  href: string;
}

/** Matches a free-text make/model (and optional year) to a published market model. */
export async function matchMarketModel(
  make: string,
  model: string,
  year?: number | null,
): Promise<MarketMatch | null> {
  const makeSlug = slugify(make);
  const modelSlug = slugify(model);
  const candidates = [modelSlug, `911-${modelSlug}`, modelSlug.replace(/^porsche-/, "")];
  for (const c of candidates) {
    const snapshot = await getMarketSnapshot(makeSlug, c);
    if (!snapshot) continue;
    let generation: string | null = null;
    if (year) {
      for (const [code, years] of Object.entries(snapshot.years)) {
        if (years.includes(year)) generation = code;
      }
    }
    return { snapshot, generation, href: `/${snapshot.make.slug}/${snapshot.model.slug}` };
  }
  return null;
}

export interface CatalogMatch {
  makeSlug: string;
  modelSlug: string;
  modelName: string;
  reportStatus: "none" | "requested" | "building" | "ready" | "failed";
  reportError: string | null;
}

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * Matches a listing's free-text make/model/title to a catalog model, for cars the
 * sync could not match by alias. Looks at every make sharing the first word of the
 * make ("Mercedes-Benz" also covers Mercedes-AMG), then picks the model whose name
 * appears in the model text or the title, longest name first so "GT3 RS" beats "GT3".
 * Read-only; nothing is persisted.
 */
export const matchCatalog = cache(
  async (
    make: string | null | undefined,
    model: string | null | undefined,
    title: string | null | undefined,
  ): Promise<CatalogMatch | null> => {
    let makeText = (make ?? "").trim();
    if (!makeText) {
      // Platform rows often carry only a title ("2012 Mercedes-Benz C63 AMG"): find the make in it.
      const t = norm(title ?? "");
      if (!t) return null;
      const allMakes = await db.select({ name: makes.name, slug: makes.slug }).from(makes);
      let bestMake: { name: string; slug: string } | null = null;
      for (const m of allMakes) {
        const n = norm(m.name);
        if (
          n.length >= 2 &&
          t.includes(n) &&
          n.length > (bestMake ? norm(bestMake.name).length : 0)
        )
          bestMake = m;
      }
      if (!bestMake) return null;
      makeText = bestMake.name;
    }
    const first = slugify(makeText).split("-")[0];
    if (!first || first.length < 2) return null;
    const rows = await db
      .select({
        makeSlug: makes.slug,
        modelSlug: models.slug,
        modelName: models.name,
        shortName: models.shortName,
        reportStatus: models.reportStatus,
        reportError: models.reportError,
      })
      .from(models)
      .innerJoin(makes, eq(makes.id, models.makeId))
      .where(or(ilike(makes.slug, `${first}-%`), eq(makes.slug, first)))
      .limit(400);
    if (rows.length === 0) return null;

    const haystacks = [norm(model ?? ""), norm(title ?? "")].filter(Boolean);
    if (haystacks.length === 0) return null;
    let best: (typeof rows)[number] | null = null;
    let bestLen = 0;
    for (const r of rows) {
      for (const name of [r.modelName, r.shortName]) {
        if (!name) continue;
        const n = norm(name);
        if (n.length < 2) continue;
        // Purely numeric names ("911") need a word-ish boundary check; others match as substrings.
        const hit = haystacks.some((h) => h.includes(n));
        if (hit && n.length > bestLen) {
          best = r;
          bestLen = n.length;
        }
      }
    }
    if (!best) return null;
    return {
      makeSlug: best.makeSlug,
      modelSlug: best.modelSlug,
      modelName: best.modelName,
      reportStatus: best.reportStatus,
      reportError: best.reportError,
    };
  },
);
