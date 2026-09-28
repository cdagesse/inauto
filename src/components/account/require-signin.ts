import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * Same-origin redirect target or `fallback`. Accepts only an absolute path:
 * "//host" and "/\host" are protocol-relative URLs to browsers, so both are
 * rejected along with anything that does not start with "/". Control and
 * whitespace characters are rejected too: the URL parser strips tab and
 * newline before parsing, so "/\t//host" would otherwise resolve off-site.
 * A final structural check parses the path against a placeholder origin and
 * requires it to stay there.
 */
export function safeBack(path: string | null | undefined, fallback: string): string {
  if (!path || !path.startsWith("/")) return fallback;
  if (path.startsWith("//") || path.startsWith("/\\")) return fallback;
  if (/[\u0000-\u0020\u007f]/.test(path)) return fallback;
  try {
    if (new URL(path, "http://n").origin !== "http://n") return fallback;
  } catch {
    return fallback;
  }
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
