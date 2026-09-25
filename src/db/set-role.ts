import "@/env/load";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { adminActions, users } from "./schema";

/**
 * pnpm users:role <email> <user|dealer|admin>
 * The only way to grant or revoke the admin role. Runs over a direct connection,
 * never creates users, and records the change in the admin audit log.
 */
async function main() {
  const [email, role] = process.argv.slice(2);
  if (!email || !role || !["user", "dealer", "admin"].includes(role)) {
    console.error("usage: pnpm users:role <email> <user|dealer|admin>");
    process.exit(2);
  }
  const url = process.env.DATABASE_URL_UNPOOLED ?? process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  const sql = postgres(url, { max: 1 });
  try {
    const db = drizzle(sql);
    const [user] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);
    if (!user) {
      console.log(`No user with email ${email}. Sign in once first, then re-run.`);
      process.exit(1);
    }
    await db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ role: role as "user" | "dealer" | "admin" })
        .where(eq(users.id, user.id));
      await tx.insert(adminActions).values({
        adminId: user.id,
        action: `user.role.${role}`,
        targetType: "user",
        targetId: user.id,
        details: { from: user.role, via: "cli" },
      });
    });
    console.log(`${email}: ${user.role} -> ${role}`);
  } finally {
    await sql.end();
  }
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
