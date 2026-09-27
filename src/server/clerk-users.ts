"use server";

import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { auth, requireAdmin } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";
import { type ActionResult, fail, toError } from "./result";

/**
 * Makes sure the signed-in Clerk user has an InAuto row. The header calls
 * this once per browser session, so an account exists as soon as someone
 * signs up, even before they open a page that reads the session and before
 * the Clerk webhook is configured.
 */
export async function ensureUser(): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await auth();
    if (!session) return fail("Not signed in.");
    return { ok: true, data: { id: session.user.id } };
  } catch (e) {
    return toError(e);
  }
}

/**
 * Admin: pull every Clerk user and create rows for the ones we do not have.
 * Existing rows are matched by Clerk id first, then by email (attaching the
 * Clerk id). Role and status are never taken from Clerk.
 */
export async function syncUsersFromClerk(): Promise<
  ActionResult<{ seen: number; created: number; attached: number }>
> {
  try {
    await requireAdmin();
    const client = await clerkClient();
    let seen = 0;
    let created = 0;
    let attached = 0;
    let offset = 0;
    const limit = 100;
    for (let page = 0; page < 50; page++) {
      const res = await client.users.getUserList({ limit, offset, orderBy: "-created_at" });
      const batch = res.data;
      for (const cu of batch) {
        seen++;
        const email =
          cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
          cu.emailAddresses[0]?.emailAddress ??
          null;
        const lower = email?.toLowerCase() ?? null;
        const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || null;
        const image = cu.imageUrl ?? null;
        const [byClerk] = await db
          .select({ id: users.id })
          .from(users)
          .where(eq(users.clerkId, cu.id))
          .limit(1);
        if (byClerk) continue;
        if (lower) {
          const [byEmail] = await db
            .update(users)
            .set({ clerkId: cu.id, name: name ?? undefined, image: image ?? undefined })
            .where(eq(users.email, lower))
            .returning({ id: users.id });
          if (byEmail) {
            attached++;
            continue;
          }
        }
        const [row] = await db
          .insert(users)
          .values({
            clerkId: cu.id,
            email: lower,
            name,
            image,
            emailVerified: new Date(cu.createdAt),
          })
          .onConflictDoNothing()
          .returning({ id: users.id });
        if (row) created++;
      }
      if (batch.length < limit) break;
      offset += limit;
    }
    return { ok: true, data: { seen, created, attached } };
  } catch (e) {
    return toError(e);
  }
}
