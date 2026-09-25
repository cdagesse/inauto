import "server-only";
import { adminActions } from "@/db/schema";
import type { Db } from "@/db";

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** Writes one audit row. Call inside the same transaction as the change it records. */
export async function audit(
  tx: Tx | Db,
  adminId: string,
  action: string,
  targetType: string,
  targetId: string,
  details?: Record<string, unknown>,
) {
  await tx
    .insert(adminActions)
    .values({ adminId, action, targetType, targetId, details: details ?? null });
}
