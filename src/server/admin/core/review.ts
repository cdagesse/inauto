import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { auctionResults, dealerSales, generations } from "@/db/schema";
import { type ActionResult, fail, toError } from "@/server/result";
import { audit } from "./audit";

export type ReviewSource = "dealer" | "auction";

/** Include clears the exclusion and review flag; exclude sets a manual exclusion jobs never overwrite. */
export async function setRowsIncluded(
  adminId: string,
  source: ReviewSource,
  ids: string[],
  include: boolean,
): Promise<ActionResult<{ count: number }>> {
  try {
    if (ids.length === 0) return fail("Select at least one row.");
    const patch = include
      ? { excludedReason: null, needsReview: false }
      : { excludedReason: "manual" as const, needsReview: false };
    const count = await db.transaction(async (tx) => {
      const rows =
        source === "dealer"
          ? await tx
              .update(dealerSales)
              .set(patch)
              .where(inArray(dealerSales.id, ids))
              .returning({ id: dealerSales.id })
          : await tx
              .update(auctionResults)
              .set(patch)
              .where(inArray(auctionResults.id, ids))
              .returning({ id: auctionResults.id });
      for (const r of rows) {
        await audit(
          tx,
          adminId,
          include ? "review.include" : "review.exclude",
          `${source}_row`,
          r.id,
        );
      }
      return rows.length;
    });
    return { ok: true, data: { count } };
  } catch (e) {
    return toError(e);
  }
}

export async function reassignGeneration(
  adminId: string,
  source: ReviewSource,
  id: string,
  generationId: string,
): Promise<ActionResult> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const [row] =
        source === "dealer"
          ? await tx
              .select({ modelId: dealerSales.modelId, generationId: dealerSales.generationId })
              .from(dealerSales)
              .where(eq(dealerSales.id, id))
          : await tx
              .select({
                modelId: auctionResults.modelId,
                generationId: auctionResults.generationId,
              })
              .from(auctionResults)
              .where(eq(auctionResults.id, id));
      if (!row) return "Row not found.";
      const [gen] = await tx
        .select({ id: generations.id, modelId: generations.modelId })
        .from(generations)
        .where(eq(generations.id, generationId));
      if (!gen || gen.modelId !== row.modelId) return "Generation does not belong to this model.";
      if (source === "dealer")
        await tx
          .update(dealerSales)
          .set({ generationId, needsReview: false })
          .where(eq(dealerSales.id, id));
      else
        await tx
          .update(auctionResults)
          .set({ generationId, needsReview: false })
          .where(eq(auctionResults.id, id));
      await audit(tx, adminId, "review.reassign", `${source}_row`, id, {
        from: row.generationId,
        to: generationId,
      });
      return null;
    });
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}
