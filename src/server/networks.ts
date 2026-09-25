"use server";

import { randomBytes } from "node:crypto";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireUser } from "@/auth";
import { db } from "@/db";
import { networkInvites, networkMembers, networks } from "@/db/schema";
import { acceptInvite, hashToken } from "./queries/networks";
import { type ActionResult, fail, slugify, toError } from "./result";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export async function createNetwork(fd: FormData): Promise<ActionResult<{ slug: string }>> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({
        name: z.string().trim().min(2).max(60),
        description: z.string().trim().max(500).optional(),
      })
      .safeParse({ name: fd.get("name"), description: fd.get("description") ?? undefined });
    if (!parsed.success) return fail("Network name must be 2 to 60 characters.");
    const base = slugify(parsed.data.name) || "network";
    const slug = `${base}-${randomBytes(3).toString("hex")}`;
    const created = await db.transaction(async (tx) => {
      const [net] = await tx
        .insert(networks)
        .values({
          ownerId: user.id,
          name: parsed.data.name,
          slug,
          description: parsed.data.description || null,
        })
        .returning();
      await tx.insert(networkMembers).values({ networkId: net.id, userId: user.id, role: "owner" });
      return net;
    });
    revalidatePath("/networks");
    return { ok: true, data: { slug: created.slug } };
  } catch (e) {
    return toError(e);
  }
}

/** Creates a single-use invite. The raw token is returned once and never stored. */
export async function createInvite(fd: FormData): Promise<ActionResult<{ token: string }>> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({
        networkId: z.string().uuid(),
        email: z.string().trim().email().max(200).or(z.literal("")).optional(),
      })
      .safeParse({ networkId: fd.get("networkId"), email: fd.get("email") ?? "" });
    if (!parsed.success) return fail("Enter a valid email or leave it blank.");
    const [net] = await db
      .select({ id: networks.id, slug: networks.slug })
      .from(networks)
      .where(and(eq(networks.id, parsed.data.networkId), eq(networks.ownerId, user.id)))
      .limit(1);
    if (!net) return fail("Only the network owner can invite.");
    const token = randomBytes(32).toString("base64url");
    await db.insert(networkInvites).values({
      networkId: net.id,
      invitedBy: user.id,
      email: parsed.data.email ? parsed.data.email.toLowerCase() : null,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    });
    revalidatePath(`/networks/${net.slug}`);
    return { ok: true, data: { token } };
  } catch (e) {
    return toError(e);
  }
}

export async function revokeInvite(fd: FormData): Promise<ActionResult> {
  try {
    const user = await requireUser();
    const parsed = z
      .object({ inviteId: z.string().uuid() })
      .safeParse({ inviteId: fd.get("inviteId") });
    if (!parsed.success) return fail("Invalid request.");
    const owned = db
      .select({ id: networks.id })
      .from(networks)
      .where(eq(networks.ownerId, user.id));
    await db
      .delete(networkInvites)
      .where(
        and(
          eq(networkInvites.id, parsed.data.inviteId),
          inArray(networkInvites.networkId, owned),
          isNull(networkInvites.acceptedAt),
        ),
      );
    revalidatePath("/networks");
    return { ok: true };
  } catch (e) {
    return toError(e);
  }
}

export async function acceptInviteAction(fd: FormData): Promise<ActionResult<{ slug: string }>> {
  try {
    const user = await requireUser();
    return acceptInvite(String(fd.get("token") ?? ""), user.id);
  } catch (e) {
    return toError(e);
  }
}
