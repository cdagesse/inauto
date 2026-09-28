/**
 * Pure helpers for the Buy page's fuzzy search. The query is split into words and each
 * word must appear in a listing's year, make, model, trim or title, either literally or
 * within trigram word-similarity distance, so "porshe gt3" still finds a Porsche 911 GT3.
 */

/** Trigram word similarity below which a token does not match (pg_trgm word_similarity). */
export const SEARCH_MIN_SIMILARITY = 0.5;

/** At most this many words are matched; the rest of a long query is ignored. */
export const SEARCH_MAX_TOKENS = 6;

/** Lower-cased words of 2 to 30 characters, deduplicated, in query order. */
export function searchTokens(q: string | null | undefined): string[] {
  if (!q) return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of q.toLowerCase().split(/[\s,/]+/)) {
    const t = raw.replace(/[^a-z0-9.+-]/g, "");
    if (t.length < 2 || t.length > 30 || seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length === SEARCH_MAX_TOKENS) break;
  }
  return out;
}

/** True when the query has at least one usable word. */
export function hasSearch(q: string | null | undefined): boolean {
  return searchTokens(q).length > 0;
}
