/** Rows per multi-row INSERT for external_listing upserts: ~27 columns (two jsonb) per row keeps
 *  each statement small and far below Postgres's 65,535 bind-parameter limit. */
export const UPSERT_CHUNK = 200;

/** Split `items` into consecutive slices of at most `size` (the last may be shorter). */
export function chunk<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size < 1)
    throw new RangeError("chunk size must be a positive integer");
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
