/** Pure helpers for the sell picker and the sell valuation page. No server imports. */

export interface PickerGeneration {
  code: string;
  name: string;
  yearStart: number;
  yearEnd: number;
}

export interface PickerModel {
  name: string;
  slug: string;
  shortName: string | null;
  yearStart: number | null;
  yearEnd: number | null;
  ready: boolean;
  generations: PickerGeneration[];
}

const THIS_YEAR = new Date().getFullYear();

/** Model years a model was sold, newest first. */
export function yearsFor(m: PickerModel | null): number[] {
  if (!m) return [];
  const genStarts = m.generations.map((g) => g.yearStart);
  const genEnds = m.generations.map((g) => g.yearEnd);
  const start = m.yearStart ?? (genStarts.length ? Math.min(...genStarts) : THIS_YEAR - 30);
  const end = m.yearEnd ?? Math.max(THIS_YEAR + 1, ...(genEnds.length ? genEnds : [start]));
  const out: number[] = [];
  for (let y = Math.max(end, start); y >= start; y--) out.push(y);
  return out;
}

/** Generations offered for a model year: those covering the year, else all of them. */
export function trimsFor(m: PickerModel | null, year: number | null): PickerGeneration[] {
  if (!m) return [];
  if (!year) return m.generations;
  const hit = m.generations.filter((g) => year >= g.yearStart && year <= g.yearEnd);
  return hit.length ? hit : m.generations;
}

/** Builds the /sell/{make}/{model} URL for the chosen car. */
export function sellHref(input: {
  makeSlug: string;
  modelSlug: string;
  year: number | null;
  gen: string | null;
  trim: string | null;
  miles: number | null;
}) {
  const p = new URLSearchParams();
  if (input.year) p.set("year", String(input.year));
  if (input.gen) p.set("gen", input.gen);
  if (input.trim) p.set("trim", input.trim);
  if (input.miles != null) p.set("miles", String(input.miles));
  const qs = p.toString();
  return `/sell/${input.makeSlug}/${input.modelSlug}${qs ? `?${qs}` : ""}`;
}

/** Generation code for a model year, or the newest generation when the year is unknown. */
export function generationFor(
  years: Record<string, number[]>,
  order: string[],
  year: number | undefined,
  requested: string | undefined,
): string {
  if (requested && order.includes(requested)) return requested;
  if (year) for (const code of order) if ((years[code] ?? []).includes(year)) return code;
  return order[0]!;
}
