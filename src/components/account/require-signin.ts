import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Same-origin redirect target or `fallback`. Accepts only an absolute path:
 * "//host" and "/\host" are protocol-relative URLs to browsers, so both are
 * rejected along with anything that does not start with "/".
 */
export function safeBack(path: string | null | undefined, fallback: string): string {
  if (!path || !path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  return path;
}

/** Builds a sign-in URL that returns to `path` afterwards. Only same-origin paths are accepted. */
export function signInHref(path: string) {
  return `/signin?redirect_url=${encodeURIComponent(safeBack(path, "/garage"))}`;
}

/** Resolves the signed-in user for a page, or redirects to sign-in with a safe return path. */
export async function requireSignedIn(callbackUrl: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(signInHref(callbackUrl));
  return session.user;
}
