import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { listings, serviceOrders } from "@/db/schema";
import { type ActionResult, fail, toError } from "@/server/result";
import { serviceTransitionError } from "../rules";
import { audit } from "./audit";

async function transition(
  adminId: string,
  orderId: string,
  action: "start" | "complete" | "decline",
  note: string | null,
  result: Record<string, unknown> | null,
): Promise<ActionResult> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const [order] = await tx
        .select()
        .from(serviceOrders)
        .where(eq(serviceOrders.id, orderId))
        .for("update");
      if (!order) return "Order not found.";
      const err = serviceTransitionError(order.status, action);
      if (err) return err;
      const status =
        action === "start" ? "in_progress" : action === "complete" ? "complete" : "declined";
      await tx
        .update(serviceOrders)
        .set({
          status,
          reviewerId: adminId,
          reviewedAt: new Date(),
          reviewNote: note ?? order.reviewNote,
          result: result ?? order.result,
        })
        .where(eq(serviceOrders.id, orderId));
      if (action === "complete" && order.kind === "title_vetting" && order.listingId) {
        await tx
          .update(listings)
          .set({ titleVetted: true })
          .where(eq(listings.id, order.listingId));
      }
      await audit(tx, adminId, `service.${order.kind}.${action}`, "service_order", orderId, {
        listingId: order.listingId,
        vin: order.vin,
        note,
      });
      return null;
    });
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export const startServiceOrder = (adminId: string, orderId: string) =>
  transition(adminId, orderId, "start", null, null);

/** Completing a title-vetting order also flags the linked listing's title as vetted. */
export const completeServiceOrder = (
  adminId: string,
  orderId: string,
  note: string | null,
  reportUrl: string | null,
) =>
  transition(adminId, orderId, "complete", note, {
    vetted: true,
    completedBy: adminId,
    ...(reportUrl ? { reportUrl } : {}),
    ...(note ? { note } : {}),
  });

export const declineServiceOrder = (adminId: string, orderId: string, note: string) =>
  transition(adminId, orderId, "decline", note, { vetted: false, declined: true, note });
