"use client";

import Link from "next/link";
import { signOut, useSession } from "next-auth/react";

export function UserMenu() {
  const { data, status } = useSession();
  if (status === "loading") {
    return (
      <span className="btn sm" style={{ visibility: "hidden" }} aria-hidden="true">
        Sign in
      </span>
    );
  }
  if (!data?.user) {
    return (
      <Link href="/signin" className="btn sm primary">
        Sign in
      </Link>
    );
  }
  return (
    <div className="user-menu">
      <Link href="/garage" className="mono" style={{ color: "var(--ink-2)" }}>
        {data.user.name ?? data.user.email}
      </Link>
      <button type="button" className="btn sm" onClick={() => signOut({ callbackUrl: "/" })}>
        Sign out
      </button>
    </div>
  );
}
