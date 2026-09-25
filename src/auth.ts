import "server-only";
import { cache } from "react";
import { eq } from "drizzle-orm";
import { auth as clerkAuth, currentUser } from "@clerk/nextjs/server";
import { db } from "@/db";
import { users } from "@/db/schema";

/**
 * Clerk owns identity and sessions; the `user` table owns role and account
 * status. `auth()` resolves the Clerk session to our user row (creating it on
 * first sight, or attaching the Clerk id to a pre-existing row with the same
 * email so garages and listings survive the migration). Cached per request.
 */
export type Role = "user" | "dealer" | "admin";
export type Status = "active" | "disabled" | "blocked";

export interface SessionUser {
  id: string; // our uuid
  clerkId: string;
  role: Role;
  status: Status;
  name: string | null;
  email: string | null;
  image: string | null;
}

const COLUMNS = {
  id: users.id,
  clerkId: users.clerkId,
  role: users.role,
  status: users.status,
  name: users.name,
  email: users.email,
  image: users.image,
};

async function provision(clerkId: string): Promise<SessionUser | null> {
  const cu = await currentUser();
  if (!cu) return null;
  const email =
    cu.emailAddresses.find((e) => e.id === cu.primaryEmailAddressId)?.emailAddress ??
    cu.emailAddresses[0]?.emailAddress ??
    null;
  const name = [cu.firstName, cu.lastName].filter(Boolean).join(" ") || cu.username || null;
  const image = cu.imageUrl ?? null;
  const lower = email?.toLowerCase() ?? null;

  // Attach to an existing row by email first (users created before Clerk).
  if (lower) {
    const [byEmail] = await db
      .update(users)
      .set({ clerkId, name: name ?? undefined, image: image ?? undefined })
      .where(eq(users.email, lower))
      .returning(COLUMNS);
    if (byEmail) return byEmail as SessionUser;
  }
  const [created] = await db
    .insert(users)
    .values({ clerkId, email: lower, name, image, emailVerified: new Date() })
    .onConflictDoNothing({ target: users.clerkId })
    .returning(COLUMNS);
  if (created) return created as SessionUser;
  const [row] = await db.select(COLUMNS).from(users).where(eq(users.clerkId, clerkId)).limit(1);
  return (row as SessionUser) ?? null;
}

/**
 * Current session, or null. Shape kept compatible with the previous Auth.js
 * layer (`session.user.id` is our uuid) so call sites need no changes.
 */
export const auth = cache(async (): Promise<{ user: SessionUser } | null> => {
  const { userId } = await clerkAuth();
  if (!userId) return null;
  const [row] = await db.select(COLUMNS).from(users).where(eq(users.clerkId, userId)).limit(1);
  const user = (row as SessionUser | undefined) ?? (await provision(userId));
  return user ? { user } : null;
});

/**
 * Returns the signed-in user or throws. Use in server actions and route handlers.
 * Account status comes from our database on every call (one indexed read), so a
 * disabled or blocked account stops acting immediately regardless of its Clerk session.
 */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  if (!session) throw new Error("UNAUTHENTICATED");
  if (session.user.status !== "active") throw new Error("ACCOUNT_DISABLED");
  return session.user;
}

/** Like requireUser but also requires the admin role. */
export async function requireAdmin(): Promise<SessionUser> {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}
