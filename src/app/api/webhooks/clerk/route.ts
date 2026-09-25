import { NextResponse, type NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { verifyWebhook } from "@clerk/nextjs/webhooks";
import { db } from "@/db";
import { users } from "@/db/schema";
import { env } from "@/env/server";

export const runtime = "nodejs";

/**
 * Clerk → InAuto user sync. Signature-verified (Svix) with CLERK_WEBHOOK_SIGNING_SECRET.
 * user.created / user.updated upsert identity fields by Clerk id (attaching to a
 * pre-existing row by email); user.deleted disables the account but keeps the row
 * so listings, bids and the audit log stay intact. Role and status are never
 * taken from Clerk.
 */
export async function POST(req: NextRequest) {
  if (!env.CLERK_WEBHOOK_SIGNING_SECRET)
    return NextResponse.json({ error: "webhook not configured" }, { status: 503 });
  let evt;
  try {
    evt = await verifyWebhook(req, { signingSecret: env.CLERK_WEBHOOK_SIGNING_SECRET });
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  if (evt.type === "user.created" || evt.type === "user.updated") {
    const d = evt.data;
    const email =
      d.email_addresses.find((e) => e.id === d.primary_email_address_id)?.email_address ??
      d.email_addresses[0]?.email_address ??
      null;
    const lower = email?.toLowerCase() ?? null;
    const name = [d.first_name, d.last_name].filter(Boolean).join(" ") || d.username || null;
    const image = d.image_url ?? null;
    const [byClerk] = await db
      .update(users)
      .set({ email: lower ?? undefined, name, image })
      .where(eq(users.clerkId, d.id))
      .returning({ id: users.id });
    if (!byClerk) {
      const [byEmail] = lower
        ? await db
            .update(users)
            .set({ clerkId: d.id, name, image })
            .where(eq(users.email, lower))
            .returning({ id: users.id })
        : [];
      if (!byEmail) {
        await db
          .insert(users)
          .values({ clerkId: d.id, email: lower, name, image, emailVerified: new Date() })
          .onConflictDoNothing();
      }
    }
    return NextResponse.json({ ok: true });
  }

  if (evt.type === "user.deleted" && evt.data.id) {
    await db
      .update(users)
      .set({ status: "disabled", statusReason: "Deleted in Clerk", statusChangedAt: new Date() })
      .where(eq(users.clerkId, evt.data.id));
    return NextResponse.json({ ok: true });
  }

  return NextResponse.json({ ok: true, ignored: evt.type });
}
