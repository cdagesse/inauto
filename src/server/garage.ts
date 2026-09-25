"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { garageCars } from "@/db/schema";
import { type ActionResult, fail, toError } from "./result";

const statusSchema = z.enum(["wishlist", "owned", "previous"]);
const optInt = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : Number(v)))
  .pipe(z.number().int().min(0).max(100_000_000).nullable());
const optDate = z
  .string()
  .trim()
  .transform((v) => (v === "" ? null : v))
  .pipe(
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .nullable(),
  );
const optText = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .transform((v) => (v === "" ? null : v));

const carSchema = z.object({
  status: statusSchema,
  make: z.string().trim().min(1).max(60),
  model: z.string().trim().min(1).max(80),
  year: optInt.pipe(z.number().int().min(1900).max(2100).nullable()),
  trim: optText(80),
  vin: optText(17).pipe(
    z
      .string()
      .regex(/^[A-HJ-NPR-Z0-9]{11,17}$/i)
      .nullable(),
  ),
  miles: optInt,
  color: optText(60),
  nickname: optText(60),
  notes: optText(2000),
  purchasePrice: optInt,
  salePrice: optInt,
  acquiredAt: optDate,
  soldAt: optDate,
});

function formToObject(fd: FormData) {
  const o: Record<string, string> = {};
  fd.forEach((v, k) => {
    if (typeof v === "string") o[k] = v;
  });
  return o;
}

export async function addGarageCar(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = carSchema.safeParse(formToObject(fd));
    if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? "Invalid car details.");
    await db
      .insert(garageCars)
      .values({ ...parsed.data, vin: parsed.data.vin?.toUpperCase() ?? null, userId: user.id });
    revalidatePath("/garage");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function moveGarageCar(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({ id: z.string().uuid(), status: statusSchema })
      .safeParse(formToObject(fd));
    if (!parsed.success) return fail("Invalid request.");
    await db
      .update(garageCars)
      .set({ status: parsed.data.status })
      .where(and(eq(garageCars.id, parsed.data.id), eq(garageCars.userId, user.id)));
    revalidatePath("/garage");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function deleteGarageCar(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z.object({ id: z.string().uuid() }).safeParse(formToObject(fd));
    if (!parsed.success) return fail("Invalid request.");
    await db
      .delete(garageCars)
      .where(and(eq(garageCars.id, parsed.data.id), eq(garageCars.userId, user.id)));
    revalidatePath("/garage");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}
