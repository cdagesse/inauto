import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { serviceOrders } from "@/db/schema";

export async function listMyServiceOrders(userId: string) {
  return db
    .select()
    .from(serviceOrders)
    .where(eq(serviceOrders.userId, userId))
    .orderBy(desc(serviceOrders.createdAt))
    .limit(50);
}
