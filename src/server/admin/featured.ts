"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { featuredCars } from "@/db/schema";

const schema = z.object({
  kind: z.enum(["listing", "external"]),
  refId: z.string().min(1).max(120),
  back: z.string().max(300).optional(),
});

/** Adds the car to the home rotation, or removes it when it is already there. */
export async function toggleFeaturedForm(fd: FormData) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({
    kind: fd.get("kind"),
    refId: fd.get("refId"),
    back: fd.get("back") ?? undefined,
  });
  if (!parsed.success) redirect("/admin/featured?error=Invalid+request");
  const { kind, refId } = parsed.data;
  const back =
    parsed.data.back && parsed.data.back.startsWith("/") ? parsed.data.back : "/admin/featured";
  const removed = await db
    .delete(featuredCars)
    .where(and(eq(featuredCars.kind, kind), eq(featuredCars.refId, refId)))
    .returning({ id: featuredCars.id });
  if (removed.length === 0) {
    const [{ next }] = await db
      .select({ next: sql<number>`coalesce(max(${featuredCars.sortOrder}), 0) + 1` })
      .from(featuredCars);
    await db
      .insert(featuredCars)
      .values({ kind, refId, sortOrder: Number(next), createdBy: admin.id })
      .onConflictDoNothing();
  }
  revalidatePath("/");
  revalidatePath("/admin/featured");
  if (kind === "listing") revalidatePath(`/listings/${refId}`);
  redirect(
    `${back}${back.includes("?") ? "&" : "?"}ok=${removed.length ? "Removed+from+the+home+page" : "Featured+on+the+home+page"}`,
  );
}
