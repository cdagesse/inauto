"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { serviceOrders } from "@/db/schema";
import { consignmentSchema } from "@/lib/sell/consignment";
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

/**
 * A virtual consignment request: the seller's car, where it is, and which of our services
 * they want. Filed as a service order of kind "consignment" so it lands in the admin queue
 * with the other work; we follow up by email.
 */
export async function requestConsignment(fd: FormData): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireUser();
    const parsed = consignmentSchema.safeParse({
      year: fd.get("year"),
      make: fd.get("make"),
      model: fd.get("model"),
      trim: fd.get("trim") ?? "",
      miles: fd.get("miles"),
      vin: fd.get("vin") ?? "",
      location: fd.get("location"),
      phone: fd.get("phone") ?? "",
      services: fd.getAll("services"),
      estimate: fd.get("estimate") || undefined,
      notes: fd.get("notes") ?? "",
    });
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid request.");
    const d = parsed.data;
    const [row] = await db
      .insert(serviceOrders)
      .values({
        userId: user.id,
        kind: "consignment",
        vin: d.vin || null,
        details: {
          year: d.year,
          make: d.make,
          model: d.model,
          trim: d.trim || null,
          miles: d.miles,
          location: d.location,
          phone: d.phone || null,
          services: d.services,
          estimate: d.estimate ?? null,
          notes: d.notes || null,
        },
      })
      .returning({ id: serviceOrders.id });
    revalidatePath("/tools");
    return { ok: true, data: { id: row.id } };
  } catch (e) {
    return toError(e);
  }
}
