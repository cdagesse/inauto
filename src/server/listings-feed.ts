"use server";

import { z } from "zod";
import { auth } from "@/auth";
import { PLATFORM_KEYS } from "@/lib/sources/platforms";
import { listingFilterSchema } from "./listings-schema";
import { type ExternalCardData, listExternalListings } from "./queries/external";
import { listActiveListings } from "./queries/listings";
import { type ActionResult, fail, toError } from "./result";

export type ListingFeedRow = Awaited<ReturnType<typeof listActiveListings>>["rows"][number];

/** Public, read-only. Next page of active InAuto listings visible to the current viewer. */
export async function loadMoreListings(
  raw: unknown,
): Promise<ActionResult<{ rows: ListingFeedRow[]; nextCursor: string | null }>> {
  try {
    const parsed = listingFilterSchema.safeParse(raw);
    if (!parsed.success) return fail("Invalid filter.");
    const session = await auth();
    const page = await listActiveListings(session?.user?.id ?? null, parsed.data);
    return { ok: true, data: page };
  } catch (e) {
    return toError(e);
  }
}

const externalSchema = z.object({
  source: z.enum(PLATFORM_KEYS).optional(),
  make: z.string().trim().min(1).max(60).optional(),
  cursor: z.string().max(160).optional(),
  limit: z.number().int().min(1).max(48).optional(),
});

/** Public, read-only. Next page of platform auctions (live first, then settled). */
export async function loadMoreExternal(
  raw: unknown,
): Promise<ActionResult<{ rows: ExternalCardData[]; nextCursor: string | null }>> {
  try {
    const parsed = externalSchema.safeParse(raw);
    if (!parsed.success) return fail("Invalid filter.");
    const page = await listExternalListings({ ...parsed.data, includeSettled: true });
    return { ok: true, data: page };
  } catch (e) {
    return toError(e);
  }
}
