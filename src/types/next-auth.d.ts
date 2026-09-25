import type { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: { id: string; role: "user" | "dealer" | "admin" } & DefaultSession["user"];
  }
}
declare module "next-auth/jwt" {
  interface JWT {
    uid?: string;
    role?: string;
  }
}
