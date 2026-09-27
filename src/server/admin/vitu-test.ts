"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import { serviceOrders } from "@/db/schema";
import { runTitleVetting } from "@/jobs/title-vetting";

/**
 * Admin VIN tester: creates a title-vetting order with no listing, tagged
 * details.test = { state, sellerName, miles }, and runs the job for it right
 * away. The same cron and webhook then finish it like any customer order.
 */
const schema = z.object({
  vin: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-HJ-NPR-Z0-9]{17}$/, "VIN must be 17 characters (no I, O or Q)"),
  state: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z]{2}$/, "State must be two letters"),
  sellerName: z.string().trim().max(120).optional().or(z.literal("")),
  miles: z.coerce.number().int().min(0).max(2_000_000).optional().or(z.literal("")),
});

export async function createVituTest(fd: FormData) {
  const admin = await requireAdmin();
  const parsed = schema.safeParse({
    vin: fd.get("vin"),
    state: fd.get("state"),
    sellerName: fd.get("sellerName") ?? "",
    miles: fd.get("miles") || "",
  });
  if (!parsed.success)
    redirect(
      `/admin/vitu?error=${encodeURIComponent(parsed.error.issues[0]?.message ?? "Invalid input")}`,
    );
  const d = parsed.data;
  const [row] = await db
    .insert(serviceOrders)
    .values({
      userId: admin.id,
      kind: "title_vetting",
      status: "requested",
      vin: d.vin,
      details: {
        test: {
          state: d.state,
          sellerName: d.sellerName || null,
          miles: typeof d.miles === "number" ? d.miles : null,
        },
      },
    })
    .returning({ id: serviceOrders.id });
  const run = await runTitleVetting({ onlyOrderId: row!.id, limit: 1 });
  revalidatePath("/admin/vitu");
  const msg = run.skipped
    ? run.skipped
    : run.errors.length
      ? run.errors.join(" | ")
      : `Inquiries created: ${run.processed.map((p) => p.step).join(", ") || "none"}. Refresh in a minute for results.`;
  redirect(
    `/admin/vitu?${run.errors.length || run.skipped ? "error" : "ok"}=${encodeURIComponent(msg)}`,
  );
}

export async function refreshVituTest(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/i.test(id)) redirect("/admin/vitu?error=Bad+id");
  const run = await runTitleVetting({ onlyOrderId: id, limit: 1 });
  revalidatePath("/admin/vitu");
  const msg = run.errors.length
    ? run.errors.join(" | ")
    : run.processed.length
      ? `Updated: ${run.processed.map((p) => `${p.step}${p.verdict ? ` ${p.verdict}` : ""}`).join(", ")}`
      : "Still waiting on Vitu.";
  redirect(`/admin/vitu?${run.errors.length ? "error" : "ok"}=${encodeURIComponent(msg)}`);
}

export async function deleteVituTest(fd: FormData) {
  await requireAdmin();
  const id = String(fd.get("id") ?? "");
  if (/^[0-9a-f-]{36}$/i.test(id))
    await db
      .delete(serviceOrders)
      .where(and(eq(serviceOrders.id, id), sql`${serviceOrders.details} ? 'test'`));
  revalidatePath("/admin/vitu");
  redirect("/admin/vitu?ok=Removed");
}

export async function listVituTests() {
  await requireAdmin();
  return db
    .select({
      id: serviceOrders.id,
      vin: serviceOrders.vin,
      status: serviceOrders.status,
      details: serviceOrders.details,
      result: serviceOrders.result,
      createdAt: serviceOrders.createdAt,
      reviewedAt: serviceOrders.reviewedAt,
    })
    .from(serviceOrders)
    .where(and(eq(serviceOrders.kind, "title_vetting"), sql`${serviceOrders.details} ? 'test'`))
    .orderBy(desc(serviceOrders.createdAt))
    .limit(25);
}
