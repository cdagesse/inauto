import "server-only";
import { and, count, eq } from "drizzle-orm";
import { db } from "@/db";
import {
  auctionResults,
  dealerSales,
  garageCars,
  generations,
  listings,
  makes,
  modelAliases,
  models,
} from "@/db/schema";
import { type ActionResult, fail, slugify, toError } from "@/server/result";
import { audit } from "./audit";

export interface NewModelInput {
  makeName: string;
  name: string;
  shortName?: string | null;
  parentLine?: string | null;
  yearStart?: number | null;
  yearEnd?: number | null;
  visor?: { rawMake: string; rawModel: string; rawTrimPattern?: string | null } | null;
  ocd?: { rawMake: string; rawModel: string } | null;
  generations?: GenerationInput[];
}

export interface GenerationInput {
  id?: string;
  code: string;
  name: string;
  yearStart: number;
  yearEnd: number;
  originalMsrp?: number | null;
  engine?: string | null;
  hp?: string | null;
  gearbox?: string | null;
  notes?: string | null;
  packages?: string[];
  sortOrder?: number;
}

/** Creates make (if missing), model, aliases and generations; a single "all years" generation when none are given. */
export async function createModel(
  adminId: string,
  input: NewModelInput,
): Promise<ActionResult<{ modelId: string }>> {
  try {
    const makeSlug = slugify(input.makeName);
    const modelSlug = slugify(input.name);
    if (!makeSlug || !modelSlug) return fail("Make and model names are required.");
    const outcome: { error: string } | { modelId: string } = await db.transaction(async (tx) => {
      const [make] = await tx
        .insert(makes)
        .values({ name: input.makeName.trim(), slug: makeSlug })
        .onConflictDoUpdate({ target: makes.slug, set: { name: input.makeName.trim() } })
        .returning({ id: makes.id });
      const [exists] = await tx
        .select({ id: models.id })
        .from(models)
        .where(and(eq(models.makeId, make.id), eq(models.slug, modelSlug)))
        .limit(1);
      if (exists) return { error: "That model already exists for this make." };
      const [model] = await tx
        .insert(models)
        .values({
          makeId: make.id,
          name: input.name.trim(),
          slug: modelSlug,
          shortName: input.shortName?.trim() || null,
          parentLine: input.parentLine?.trim() || null,
          yearStart: input.yearStart ?? null,
          yearEnd: input.yearEnd ?? null,
          searchText: `${input.makeName} ${input.name} ${input.shortName ?? ""}`
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim(),
        })
        .returning({ id: models.id });
      if (input.visor)
        await tx.insert(modelAliases).values({
          modelId: model.id,
          source: "visor",
          rawMake: input.visor.rawMake.trim(),
          rawModel: input.visor.rawModel.trim(),
          rawTrimPattern: input.visor.rawTrimPattern?.trim() || null,
        });
      if (input.ocd)
        await tx.insert(modelAliases).values({
          modelId: model.id,
          source: "ocd",
          rawMake: input.ocd.rawMake.trim(),
          rawModel: input.ocd.rawModel.trim(),
        });
      const gens: GenerationInput[] =
        input.generations && input.generations.length > 0
          ? input.generations
          : [
              {
                code: "all",
                name: "All years",
                yearStart: input.yearStart ?? 1900,
                yearEnd: input.yearEnd ?? 2100,
                sortOrder: 0,
              },
            ];
      await tx.insert(generations).values(
        gens.map((g, i) => ({
          modelId: model.id,
          code: g.code.trim(),
          name: g.name.trim(),
          yearStart: g.yearStart,
          yearEnd: g.yearEnd,
          originalMsrp: g.originalMsrp ?? null,
          engine: g.engine ?? null,
          hp: g.hp ?? null,
          gearbox: g.gearbox ?? null,
          notes: g.notes ?? null,
          packages: g.packages ?? [],
          sortOrder: g.sortOrder ?? i,
        })),
      );
      await audit(tx, adminId, "model.create", "model", model.id, {
        make: input.makeName,
        name: input.name,
      });
      return { modelId: model.id };
    });
    if ("error" in outcome) return fail(outcome.error);
    return { ok: true, data: { modelId: outcome.modelId } };
  } catch (e) {
    return toError(e);
  }
}

export async function updateModel(
  adminId: string,
  modelId: string,
  patch: {
    name?: string;
    shortName?: string | null;
    parentLine?: string | null;
    yearStart?: number | null;
    yearEnd?: number | null;
    published?: boolean;
  },
): Promise<ActionResult> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const [m] = await tx
        .select({ id: models.id, name: models.name, makeId: models.makeId })
        .from(models)
        .where(eq(models.id, modelId));
      if (!m) return "Model not found.";
      const [mk] = await tx.select({ name: makes.name }).from(makes).where(eq(makes.id, m.makeId));
      const name = patch.name?.trim() || m.name;
      await tx
        .update(models)
        .set({
          name,
          slug: slugify(name),
          shortName: patch.shortName === undefined ? undefined : patch.shortName?.trim() || null,
          parentLine: patch.parentLine === undefined ? undefined : patch.parentLine?.trim() || null,
          yearStart: patch.yearStart,
          yearEnd: patch.yearEnd,
          published: patch.published,
          searchText: `${mk?.name ?? ""} ${name} ${patch.shortName ?? ""}`
            .toLowerCase()
            .replace(/\s+/g, " ")
            .trim(),
        })
        .where(eq(models.id, modelId));
      await audit(tx, adminId, "model.update", "model", modelId, patch);
      return null;
    });
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function requestModelReport(adminId: string, modelId: string): Promise<ActionResult> {
  try {
    const rows = await db
      .update(models)
      .set({ reportStatus: "requested", reportRequestedAt: new Date(), reportError: null })
      .where(eq(models.id, modelId))
      .returning({ id: models.id });
    if (rows.length === 0) return fail("Model not found.");
    await audit(db, adminId, "model.report.request", "model", modelId);
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function upsertGeneration(
  adminId: string,
  modelId: string,
  g: GenerationInput,
): Promise<ActionResult> {
  try {
    const values = {
      modelId,
      code: g.code.trim(),
      name: g.name.trim(),
      yearStart: g.yearStart,
      yearEnd: g.yearEnd,
      originalMsrp: g.originalMsrp ?? null,
      engine: g.engine?.trim() || null,
      hp: g.hp?.trim() || null,
      gearbox: g.gearbox?.trim() || null,
      notes: g.notes?.trim() || null,
      packages: g.packages ?? [],
      sortOrder: g.sortOrder ?? 0,
    };
    const outcome = await db.transaction(async (tx) => {
      if (g.id) {
        const rows = await tx
          .update(generations)
          .set(values)
          .where(and(eq(generations.id, g.id), eq(generations.modelId, modelId)))
          .returning({ id: generations.id });
        if (rows.length === 0) return "Generation not found.";
        await audit(tx, adminId, "generation.update", "generation", g.id, values);
      } else {
        const [row] = await tx
          .insert(generations)
          .values(values)
          .onConflictDoUpdate({ target: [generations.modelId, generations.code], set: values })
          .returning({ id: generations.id });
        await audit(tx, adminId, "generation.create", "generation", row.id, values);
      }
      return null;
    });
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}

/** Deletes a generation only when no market rows, listings or garage cars reference it. */
export async function deleteGeneration(
  adminId: string,
  modelId: string,
  generationId: string,
): Promise<ActionResult> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const refs = await Promise.all([
        tx
          .select({ n: count() })
          .from(dealerSales)
          .where(eq(dealerSales.generationId, generationId)),
        tx
          .select({ n: count() })
          .from(auctionResults)
          .where(eq(auctionResults.generationId, generationId)),
        tx.select({ n: count() }).from(listings).where(eq(listings.generationId, generationId)),
        tx.select({ n: count() }).from(garageCars).where(eq(garageCars.generationId, generationId)),
      ]);
      const total = refs.reduce((a, r) => a + Number(r[0]?.n ?? 0), 0);
      if (total > 0)
        return `Cannot delete: ${total} rows reference this generation. Reassign them first.`;
      const rows = await tx
        .delete(generations)
        .where(and(eq(generations.id, generationId), eq(generations.modelId, modelId)))
        .returning({ id: generations.id });
      if (rows.length === 0) return "Generation not found.";
      await audit(tx, adminId, "generation.delete", "generation", generationId);
      return null;
    });
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function upsertAlias(
  adminId: string,
  modelId: string,
  a: {
    id?: string;
    source: "visor" | "ocd";
    rawMake: string;
    rawModel: string;
    rawTrimPattern?: string | null;
  },
): Promise<ActionResult> {
  try {
    const values = {
      modelId,
      source: a.source,
      rawMake: a.rawMake.trim(),
      rawModel: a.rawModel.trim(),
      rawTrimPattern: a.rawTrimPattern?.trim() || null,
    };
    const outcome = await db.transaction(async (tx) => {
      if (a.id) {
        const rows = await tx
          .update(modelAliases)
          .set(values)
          .where(and(eq(modelAliases.id, a.id), eq(modelAliases.modelId, modelId)))
          .returning({ id: modelAliases.id });
        if (rows.length === 0) return "Alias not found.";
        await audit(tx, adminId, "alias.update", "model_alias", a.id, values);
      } else {
        const [row] = await tx
          .insert(modelAliases)
          .values(values)
          .returning({ id: modelAliases.id });
        await audit(tx, adminId, "alias.create", "model_alias", row.id, values);
      }
      return null;
    });
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteAlias(
  adminId: string,
  modelId: string,
  aliasId: string,
): Promise<ActionResult> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const rows = await tx
        .delete(modelAliases)
        .where(and(eq(modelAliases.id, aliasId), eq(modelAliases.modelId, modelId)))
        .returning({ id: modelAliases.id });
      if (rows.length === 0) return "Alias not found.";
      await audit(tx, adminId, "alias.delete", "model_alias", aliasId);
      return null;
    });
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}
