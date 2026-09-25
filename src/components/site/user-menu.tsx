import Link from "next/link";
import { signOut } from "@/auth";

export function UserMenu({ user }: { user: { name?: string | null; email?: string | null } | null }) {
  if (!user) {
    return (
      <Link href="/signin" className="btn sm primary">
        Sign in
      </Link>
    );
  }
  return (
    <form
      action={async () => {
        "use server";
        await signOut({ redirectTo: "/" });
      }}
      className="user-menu"
    >
      <Link href="/garage" className="mono" style={{ color: "var(--ink-2)" }}>
        {user.name ?? user.email}
      </Link>
      <button type="submit" className="btn sm">
        Sign out
      </button>
    </form>
  );
}
