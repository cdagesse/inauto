import "server-only";
import { desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { garageCars } from "@/db/schema";

export async function listGarage(userId: string) {
  return db
    .select()
    .from(garageCars)
    .where(eq(garageCars.userId, userId))
    .orderBy(desc(garageCars.createdAt));
}
