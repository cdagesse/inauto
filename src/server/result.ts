export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? { data?: undefined } : { data: T }))
  | { ok: false; error: string };

export function fail(error: string): { ok: false; error: string } {
  return { ok: false, error };
}

/** Maps thrown errors from server actions to a safe client message. Never leaks DB internals. */
export function toError(e: unknown): { ok: false; error: string } {
  if (e instanceof Error && e.message === "UNAUTHENTICATED") return fail("Please sign in.");
  console.error("[action]", e);
  return fail("Something went wrong. Please try again.");
}

/**
 * A `.catch` handler for decorative page data (featured cars, trending, market
 * tree, catalogs): logs the failure so an outage during ISR regeneration leaves
 * a signal, then returns the fallback so the page still renders. Core queries
 * must not use it: let them throw so ISR keeps serving the last good page.
 */
export function soft<T>(label: string, fallback: T): (err: unknown) => T {
  return (err) => {
    console.error(`[soft] ${label}`, err);
    return fallback;
  };
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
