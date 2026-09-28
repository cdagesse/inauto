/**
 * Where client-side render errors go. Today that is the console (Vercel
 * captures browser errors through its analytics script); swap the body for a
 * real reporter without touching the error boundaries that call it.
 */
export function reportClientError(scope: string, error: Error & { digest?: string }): void {
  console.error(`[${scope}]`, error.digest ? `digest=${error.digest}` : "", error);
}
