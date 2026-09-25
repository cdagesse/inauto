"use client";

import Link from "next/link";
import { UserButton, useUser } from "@clerk/nextjs";

/**
 * Header account control. Reads only Clerk client state, so the root layout
 * stays static. The admin link keys off Clerk publicMetadata.role, which the
 * role CLI and the admin console keep in sync with our database.
 */
export function UserMenu() {
  const { user, isLoaded, isSignedIn } = useUser();
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
      <Link href="/garage" className="btn sm">
        Garage
      </Link>
      <UserButton />
    </div>
  );
}
