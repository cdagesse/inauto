/**
 * Pure normalization: map source rows onto our catalog (model, generation) and detect
 * packages / paint-to-sample from free text. No I/O.
 */

export interface GenerationRange {
  id: string;
  code: string;
  yearStart: number;
  yearEnd: number;
  /** Optional trim/package pattern used only when two generations share a model year. */
  disambiguate?: RegExp;
}

export interface AliasRule {
  modelId: string;
  source: string;
  rawMake: string;
  rawModel: string;
  rawTrimPattern: string | null; // SQL-ILIKE style pattern, e.g. "%GT3 RS%"
}

/** Convert an ILIKE pattern ("%GT3 RS%") to a case-insensitive RegExp. */
export function ilikeToRegExp(pattern: string): RegExp {
  const esc = pattern
    .replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
    .replace(/%/g, ".*")
    .replace(/_/g, ".");
  return new RegExp(`^${esc}$`, "i");
}

const norm = (s: string | null | undefined) => (s ?? "").trim().toLowerCase();
/** Trim spellings vary by feed ("AMG C63", "C 63", "C63 AMG®"): compare with spaces, hyphens and marks removed. */
const squash = (s: string) => s.replace(/[\s\-®™]/g, "");

/** Find the model an alias rule maps this raw row to, or null when no rule matches. */
export function matchAlias(
  rules: AliasRule[],
  source: string,
  raw: { make: string | null; model: string | null; text: string | null },
): string | null {
  for (const r of rules) {
    if (r.source !== source) continue;
    if (norm(r.rawMake) !== norm(raw.make)) continue;
    if (norm(r.rawModel) !== norm(raw.model)) continue;
    if (r.rawTrimPattern) {
      if (!raw.text || !ilikeToRegExp(squash(r.rawTrimPattern)).test(squash(raw.text))) continue;
    }
    return r.modelId;
  }
  return null;
}

export interface GenerationMatch {
  generationId: string | null;
  needsReview: boolean;
}

/**
 * Assign a generation by model year. When two generations share the year, use the
 * disambiguation pattern against trim/title text; if that does not settle it, flag for
 * review rather than guess.
 */
export function assignGeneration(
  gens: GenerationRange[],
  year: number | null,
  text: string | null,
): GenerationMatch {
  if (year == null) return { generationId: null, needsReview: true };
  const hits = gens.filter((g) => year >= g.yearStart && year <= g.yearEnd);
  if (hits.length === 0) return { generationId: null, needsReview: true };
  if (hits.length === 1) return { generationId: hits[0].id, needsReview: false };
  const byText = hits.filter((g) => g.disambiguate && text && g.disambiguate.test(text));
  if (byText.length === 1) return { generationId: byText[0].id, needsReview: false };
  return { generationId: null, needsReview: true };
}

const PACKAGE_PATTERNS: [string, RegExp][] = [
  ["weissach", /\bweissach\b/i],
  ["touring", /\btouring\b/i],
  ["manthey", /\bmanthey\b/i],
  ["rs_4_0", /\b(rs\s?4\.0|4\.0\s?rs)\b/i],
];

export function detectPackages(text: string | null | undefined): string[] {
  if (!text) return [];
  return PACKAGE_PATTERNS.filter(([, re]) => re.test(text)).map(([k]) => k);
}

export function detectPts(text: string | null | undefined, color?: string | null): boolean {
  const t = `${text ?? ""} ${color ?? ""}`;
  return /\b(paint[\s-]?to[\s-]?sample|\bPTS\b)/i.test(t);
}
