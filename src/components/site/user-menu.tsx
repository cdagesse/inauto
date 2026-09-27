"use client";

import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";
import { useEffect } from "react";
import { ensureUser } from "@/server/clerk-users";

/**
 * Header account control. Reads only Clerk client state, so the root layout
 * stays static. The admin link keys off Clerk publicMetadata.role, which the
 * role CLI and the admin console keep in sync with our database.
 */
export function UserMenu() {
  const { user, isLoaded, isSignedIn } = useUser();
  // Once per browser session: make sure this Clerk account has an InAuto row.
  useEffect(() => {
    if (!isSignedIn || !user) return;
    const key = `inauto-user:${user.id}`;
    try {
      if (sessionStorage.getItem(key)) return;
    } catch {}
    ensureUser().then((r) => {
      if (!r.ok) return;
      try {
        sessionStorage.setItem(key, "1");
      } catch {}
    });
  }, [isSignedIn, user]);
  if (!isLoaded) {
    return (
      <span className="btn sm" style={{ visibility: "hidden" }} aria-hidden="true">
        Sign in
      </span>
    );
  }
  if (!isSignedIn) {
    return (
      <Link href="/signin" className="btn sm primary">
        Sign in
      </Link>
    );
  }
  const isAdmin = user.publicMetadata?.role === "admin";
  return (
    <div className="user-menu">
      {isAdmin ? (
        <Link href="/admin" className="btn sm">
          Admin
        </Link>
      ) : null}
      <Link href="/garage" className="btn sm with-icon" aria-label="My garage">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M3 10.5 12 4l9 6.5V20a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-9.5Z"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinejoin="round"
          />
          <path d="M7 21v-8h10v8M7 16h10" stroke="currentColor" strokeWidth="1.8" />
        </svg>
        Garage
      </Link>
      <UserButton />
    </div>
  );
}
