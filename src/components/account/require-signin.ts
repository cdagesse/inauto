import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Builds a sign-in URL that returns to `path` afterwards. Only same-origin paths are accepted. */
export function signInHref(path: string) {
  const safe = path.startsWith("/") && !path.startsWith("//") ? path : "/garage";
  return `/signin?redirect_url=${encodeURIComponent(safe)}`;
}

/** Resolves the signed-in user for a page, or redirects to sign-in with a safe return path. */
export async function requireSignedIn(callbackUrl: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(signInHref(callbackUrl));
  return session.user;
}
