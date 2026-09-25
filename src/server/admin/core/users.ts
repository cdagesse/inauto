import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { listings, users } from "@/db/schema";
import { type ActionResult, fail, toError } from "@/server/result";
import { roleChangeError, statusChangeError, type Role, type Status } from "../rules";
import { audit } from "./audit";
import { syncClerkBan, syncClerkRole } from "./clerk-sync";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function loadPair(tx: Tx, adminId: string, targetId: string) {
  const rows = await tx
    .select({ id: users.id, role: users.role, status: users.status })
    .from(users)
    .where(inArray(users.id, [adminId, targetId]));
  return { actor: rows.find((r) => r.id === adminId), target: rows.find((r) => r.id === targetId) };
}

/**
 * Moves a user to active / disabled / blocked. Blocking also withdraws their
 * active listings so nothing they posted stays visible. One transaction, one audit row.
 */
export async function setUserStatus(
  adminId: string,
  targetId: string,
  next: Status,
  reason: string,
): Promise<ActionResult> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const { actor, target } = await loadPair(tx, adminId, targetId);
      if (!actor || !target) return "User not found.";
      const err = statusChangeError(actor, target, next);
      if (err) return err;
      await tx
        .update(users)
        .set({ status: next, statusReason: reason, statusChangedAt: new Date() })
        .where(eq(users.id, targetId));
      let withdrawn = 0;
      if (next === "blocked") {
        const rows = await tx
          .update(listings)
          .set({ status: "withdrawn" })
          .where(and(eq(listings.sellerId, targetId), eq(listings.status, "active")))
          .returning({ id: listings.id });
        withdrawn = rows.length;
      }
      await audit(tx, adminId, `user.status.${next}`, "user", targetId, {
        from: target.status,
        reason,
        withdrawnListings: withdrawn,
      });
      return null;
    });
    if (!outcome) await syncClerkBan(targetId, next !== "active");
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function setUserRole(
  adminId: string,
  targetId: string,
  next: Role,
): Promise<ActionResult> {
  try {
    const outcome = await db.transaction(async (tx) => {
      const { actor, target } = await loadPair(tx, adminId, targetId);
      if (!actor || !target) return "User not found.";
      const err = roleChangeError(actor, target, next);
      if (err) return err;
      await tx.update(users).set({ role: next }).where(eq(users.id, targetId));
      await audit(tx, adminId, `user.role.${next}`, "user", targetId, { from: target.role });
      return null;
    });
    if (!outcome) await syncClerkRole(targetId, next);
    return outcome ? fail(outcome) : { ok: true };
  } catch (e) {
    return toError(e);
  }
}
