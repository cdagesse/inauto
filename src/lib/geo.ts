/** Country display helpers for listings sourced abroad. */
const NAMES: Record<string, string> = {
  US: "United States",
  GB: "United Kingdom",
  UK: "United Kingdom",
  CA: "Canada",
  AU: "Australia",
  NZ: "New Zealand",
  DE: "Germany",
  FR: "France",
  IT: "Italy",
  ES: "Spain",
  NL: "Netherlands",
  BE: "Belgium",
  CH: "Switzerland",
  AT: "Austria",
  SE: "Sweden",
  NO: "Norway",
  DK: "Denmark",
  IE: "Ireland",
  PT: "Portugal",
  JP: "Japan",
  AE: "United Arab Emirates",
  ZA: "South Africa",
  MX: "Mexico",
};

export function normalizeCountry(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (c === "UK") return "GB";
  return /^[A-Z]{2}$/.test(c) ? c : null;
}

export function countryName(code: string | null | undefined): string | null {
  const c = normalizeCountry(code);
  if (!c) return null;
  if (NAMES[c]) return NAMES[c];
  try {
    return new Intl.DisplayNames(["en"], { type: "region" }).of(c) ?? c;
  } catch {
    return c;
  }
}

/** Regional-indicator flag for an ISO alpha-2 code, e.g. GB → 🇬🇧. */
export function flag(code: string | null | undefined): string | null {
  const c = normalizeCountry(code);
  if (!c) return null;
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** Where a car is, for a card: "Rochester, Kent · 🇬🇧 United Kingdom" outside the US, else the location alone. */
export function placeLine(location: string | null | undefined, country: string | null | undefined) {
  const c = normalizeCountry(country);
  const parts = [location?.trim() || null];
  if (c && c !== "US") parts.push(`${flag(c)} ${countryName(c)}`);
  return parts.filter(Boolean).join(" · ") || null;
}
