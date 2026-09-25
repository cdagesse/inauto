import NextAuth, { type NextAuthConfig } from "next-auth";
import type { Provider } from "next-auth/providers";
import Google from "next-auth/providers/google";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { DrizzleAdapter } from "@auth/drizzle-adapter";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { accounts, sessions, users, verificationTokens } from "@/db/schema";
import { env } from "@/env/server";

/**
 * Auth.js v5. Users, accounts and OAuth links persist in Postgres via the
 * Drizzle adapter; sessions are signed JWTs so an authenticated request
 * costs no database round-trip. Providers appear only when configured.
 */
const providers: Provider[] = [];
if (env.AUTH_GOOGLE_ID && env.AUTH_GOOGLE_SECRET) {
  providers.push(Google({ clientId: env.AUTH_GOOGLE_ID, clientSecret: env.AUTH_GOOGLE_SECRET }));
}
if (env.AUTH_GITHUB_ID && env.AUTH_GITHUB_SECRET) {
  providers.push(GitHub({ clientId: env.AUTH_GITHUB_ID, clientSecret: env.AUTH_GITHUB_SECRET }));
}
if (env.devLoginEnabled) {
  const devSchema = z.object({
    email: z.string().email(),
    name: z.string().min(1).max(80).optional(),
  });
  providers.push(
    Credentials({
      id: "dev",
      name: "Development sign-in",
      credentials: {
        email: { label: "Email", type: "email" },
        name: { label: "Name", type: "text" },
      },
      async authorize(raw) {
        const parsed = devSchema.safeParse(raw);
        if (!parsed.success) return null;
        const email = parsed.data.email.toLowerCase();
        const [existing] = await db.select().from(users).where(eq(users.email, email)).limit(1);
        if (existing) return existing;
        const [created] = await db
          .insert(users)
          .values({
            email,
            name: parsed.data.name ?? email.split("@")[0],
            emailVerified: new Date(),
          })
          .returning();
        return created ?? null;
      },
    }),
  );
}

export const providerList = providers.map((p) => {
  const meta = typeof p === "function" ? p() : p;
  return { id: meta.id, name: meta.name };
});

export const authConfig: NextAuthConfig = {
  adapter: DrizzleAdapter(db, {
    usersTable: users,
    accountsTable: accounts,
    sessionsTable: sessions,
    verificationTokensTable: verificationTokens,
  }),
  session: { strategy: "jwt", maxAge: 30 * 24 * 60 * 60 },
  providers,
  pages: { signIn: "/signin" },
  trustHost: true,
  callbacks: {
    async signIn({ user }) {
      if (!user.id) return true;
      const [row] = await db
        .select({ status: users.status })
        .from(users)
        .where(eq(users.id, user.id))
        .limit(1);
      return !row || row.status === "active";
    },
    async jwt({ token, user }) {
      if (user) {
        token.uid = user.id;
        token.role = (user as { role?: string }).role ?? "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (token.uid) session.user.id = token.uid as string;
      session.user.role = (token.role as "user" | "dealer" | "admin") ?? "user";
      return session;
    },
  },
};

export const { handlers, auth, signIn, signOut } = NextAuth(authConfig);

/**
 * Returns the signed-in user or throws. Use in server actions and route handlers.
 * Sessions are JWTs, so account status is checked here against the database
 * (one indexed primary-key read) so a disabled or blocked account stops acting
 * immediately, not when its token expires.
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHENTICATED");
  const [row] = await db
    .select({ status: users.status, role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (!row || row.status !== "active") throw new Error("ACCOUNT_DISABLED");
  return { ...session.user, role: row.role };
}

/** Like requireUser but also requires the admin role. */
export async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "admin") throw new Error("FORBIDDEN");
  return user;
}
