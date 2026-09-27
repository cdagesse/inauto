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

/** A base model with the catalog rows that belong to it (e.g. M3 → M3, M3 (E30), M3 (E46)). */
export interface PickerGroup {
  /** Display name without a trailing generation tag. */
  name: string;
  /** Slug of the base row when one exists, else the first variant's slug. */
  slug: string;
  ready: boolean;
  variants: PickerModel[];
}

/** "M3 (E30)" → "M3"; "911 / 996" stays as is. Only a trailing parenthetical is removed. */
export function baseModelName(name: string): string {
  return name.replace(/\s*\([^()]*\)\s*$/, "").trim() || name;
}

/** Groups catalog models by base name so the picker offers "M3" once, not every generation. */
export function groupModels(models: PickerModel[]): PickerGroup[] {
  const map = new Map<string, PickerGroup>();
  for (const m of models) {
    const name = baseModelName(m.name);
    const key = name.toLowerCase();
    const g = map.get(key) ?? { name, slug: m.slug, ready: false, variants: [] };
    g.variants.push(m);
    if (m.name === name) g.slug = m.slug; // the plain row is the base
    g.ready = g.ready || m.ready;
    map.set(key, g);
  }
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "en", { numeric: true }));
}

/** Model years across every variant of a group, newest first. */
export function yearsForGroup(g: PickerGroup | null): number[] {
  if (!g) return [];
  const set = new Set<number>();
  for (const v of g.variants) for (const y of yearsFor(v)) set.add(y);
  return [...set].sort((a, b) => b - a);
}

/**
 * The catalog row to use for a chosen year: a generation-specific variant whose years cover
 * it wins over the plain base row (its range is the whole model run), else the base, else
 * the first variant.
 */
export function variantFor(g: PickerGroup | null, year: number | null): PickerModel | null {
  if (!g) return null;
  const base = g.variants.find((v) => v.name === g.name) ?? null;
  if (year) {
    const specific = g.variants.filter((v) => v !== base && yearsFor(v).includes(year));
    if (specific.length) return specific[0]!;
    if (base && yearsFor(base).includes(year)) return base;
  }
  return base ?? g.variants[0] ?? null;
}
