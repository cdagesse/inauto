"use server";

import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { makes, models } from "@/db/schema";
import { toError, type ActionResult } from "./result";

const schema = z.object({
  makeSlug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  modelSlug: z
    .string()
    .min(1)
    .max(80)
    .regex(/^[a-z0-9-]+$/),
});

/**
 * Marks a catalog model as needing a market report. Idempotent: only a model in
 * `none` or `failed` moves to `requested`; anything already queued, building or
 * ready is left alone. No third-party call happens here; the reports job does the work.
 */
export async function requestMarketReport(input: {
  makeSlug: string;
  modelSlug: string;
}): Promise<ActionResult<{ status: string }>> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid model." };
  try {
    const [m] = await db
      .select({ id: models.id, status: models.reportStatus })
      .from(models)
      .innerJoin(makes, eq(makes.id, models.makeId))
      .where(
        and(
          eq(makes.slug, parsed.data.makeSlug),
          eq(models.slug, parsed.data.modelSlug),
          eq(models.published, true),
        ),
      )
      .limit(1);
    if (!m) return { ok: false, error: "Unknown model." };
    if (m.status === "none" || m.status === "failed") {
      await db
        .update(models)
        .set({ reportStatus: "requested", reportRequestedAt: sql`now()`, reportError: null })
        .where(and(eq(models.id, m.id), inArray(models.reportStatus, ["none", "failed"])));
      return { ok: true, data: { status: "requested" } };
    }
    return { ok: true, data: { status: m.status } };
  } catch (e) {
    return toError(e);
  }
}
