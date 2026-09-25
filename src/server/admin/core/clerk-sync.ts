import "server-only";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Best-effort mirrors to Clerk. Our database is the source of truth; these calls
 * make the edge session and the header reflect the change immediately. Failures
 * are logged and never fail the admin action.
 */
async function clerkIdFor(userId: string) {
  const [row] = await db
    .select({ clerkId: users.clerkId })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return row?.clerkId ?? null;
}

export async function syncClerkBan(userId: string, banned: boolean) {
  try {
    const clerkId = await clerkIdFor(userId);
    if (!clerkId) return;
    const client = await clerkClient();
    if (banned) await client.users.banUser(clerkId);
    else await client.users.unbanUser(clerkId);
  } catch (e) {
    console.warn("[clerk-sync] ban sync failed", e instanceof Error ? e.message : e);
  }
}

export async function syncClerkRole(userId: string, role: string) {
  try {
    const clerkId = await clerkIdFor(userId);
    if (!clerkId) return;
    const client = await clerkClient();
    await client.users.updateUserMetadata(clerkId, { publicMetadata: { role } });
  } catch (e) {
    console.warn("[clerk-sync] role sync failed", e instanceof Error ? e.message : e);
  }
}
