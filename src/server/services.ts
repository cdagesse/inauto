"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { serviceOrders } from "@/db/schema";
import { type ActionResult, fail, toError } from "./result";

const schema = z.object({
  kind: z.enum(["title_vetting", "condition_report"]),
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{11,17}$/, "Enter a valid VIN (11 to 17 characters, no I, O or Q).")
    .optional()
    .or(z.literal("")),
  listingId: z.string().uuid().optional().or(z.literal("")),
  notes: z.string().trim().max(1000).optional(),
});

export async function orderService(fd: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = schema.safeParse({
      kind: fd.get("kind"),
      vin: fd.get("vin") ?? "",
      listingId: fd.get("listingId") ?? "",
      notes: fd.get("notes") ?? undefined,
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
    if (!parsed.data.vin && !parsed.data.listingId)
      return fail("Enter a VIN or order from a listing.");
    const [row] = await db
      .insert(serviceOrders)
      .values({
        userId: user.id,
        kind: parsed.data.kind,
        vin: parsed.data.vin || null,
        listingId: parsed.data.listingId || null,
        details: parsed.data.notes ? { notes: parsed.data.notes } : null,
      })
      .returning({ id: serviceOrders.id });
    revalidatePath("/tools");
    if (parsed.data.listingId) revalidatePath(`/listings/${parsed.data.listingId}`);
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return toError(e);
  }
}
