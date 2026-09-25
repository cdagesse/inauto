import "server-only";
import { createHash } from "node:crypto";
import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { db } from "@/db";
import { listings, networkInvites, networkMembers, networks, users } from "@/db/schema";
import { type ActionResult, fail, toError } from "../result";

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/** Networks the user owns or belongs to. */
export async function listMyNetworks(userId: string) {
  const memberIds = db
    .select({ id: networkMembers.networkId })
    .from(networkMembers)
    .where(eq(networkMembers.userId, userId));
  return db
    .select()
    .from(networks)
    .where(or(eq(networks.ownerId, userId), inArray(networks.id, memberIds)))
    .orderBy(desc(networks.createdAt));
}

/** Network by slug, only if the user is the owner or a member. */
export async function getNetworkForMember(slug: string, userId: string) {
  const memberIds = db
    .select({ id: networkMembers.networkId })
    .from(networkMembers)
    .where(eq(networkMembers.userId, userId));
  const [net] = await db
    .select()
    .from(networks)
    .where(
      and(
        eq(networks.slug, slug),
        or(eq(networks.ownerId, userId), inArray(networks.id, memberIds)),
      ),
    )
    .limit(1);
  if (!net) return null;
  const [members, pending, netListings] = await Promise.all([
    db
      .select({
        userId: networkMembers.userId,
        role: networkMembers.role,
        name: users.name,
        joinedAt: networkMembers.joinedAt,
      })
      .from(networkMembers)
      .innerJoin(users, eq(users.id, networkMembers.userId))
      .where(eq(networkMembers.networkId, net.id)),
    net.ownerId === userId
      ? db
          .select({
            id: networkInvites.id,
            email: networkInvites.email,
            expiresAt: networkInvites.expiresAt,
            createdAt: networkInvites.createdAt,
          })
          .from(networkInvites)
          .where(
            and(
              eq(networkInvites.networkId, net.id),
              isNull(networkInvites.acceptedAt),
              sql`${networkInvites.expiresAt} > now()`,
            ),
          )
          .orderBy(desc(networkInvites.createdAt))
      : Promise.resolve([]),
    db
      .select()
      .from(listings)
      .where(and(eq(listings.networkId, net.id), eq(listings.status, "active")))
      .orderBy(desc(listings.createdAt))
      .limit(50),
  ]);
  return { network: net, isOwner: net.ownerId === userId, members, pending, listings: netListings };
}

/** Public preview of an invite: network name only, no membership data. */
export async function previewInvite(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null;
  const [row] = await db
    .select({
      name: networks.name,
      slug: networks.slug,
      expiresAt: networkInvites.expiresAt,
      acceptedAt: networkInvites.acceptedAt,
    })
    .from(networkInvites)
    .innerJoin(networks, eq(networks.id, networkInvites.networkId))
    .where(eq(networkInvites.tokenHash, hashToken(token)))
    .limit(1);
  if (!row) return null;
  return { ...row, valid: !row.acceptedAt && row.expiresAt.getTime() > Date.now() };
}

/** Atomically claims the invite (single use) and adds the caller as a member. */
export async function acceptInvite(
  token: string,
  userId: string,
): Promise<ActionResult<{ slug: string }>> {
  try {
    if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return fail("Invalid invite link.");
    const result = await db.transaction(async (tx) => {
      const [claimed] = await tx
        .update(networkInvites)
        .set({ acceptedAt: new Date(), acceptedBy: userId })
        .where(
          and(
            eq(networkInvites.tokenHash, hashToken(token)),
            isNull(networkInvites.acceptedAt),
            sql`${networkInvites.expiresAt} > now()`,
          ),
        )
        .returning({ networkId: networkInvites.networkId });
      if (!claimed) return null;
      await tx
        .insert(networkMembers)
        .values({ networkId: claimed.networkId, userId, role: "member" })
        .onConflictDoNothing();
      const [net] = await tx
        .select({ slug: networks.slug })
        .from(networks)
        .where(eq(networks.id, claimed.networkId))
        .limit(1);
      return net ?? null;
    });
    if (!result) return fail("This invite has expired or was already used.");
    revalidatePath("/networks");
    return { ok: true, data: { slug: result.slug } };
  } catch (e) {
    return toError(e);
  }
}
