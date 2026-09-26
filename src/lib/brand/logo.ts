/**
 * Car brand logos from the Motomarks image CDN (https://motomarks.io).
 *
 * Pure helpers, safe to import from client components. The publishable token
 * is designed for client-side use, so it is read from NEXT_PUBLIC_MOTOMARKS_TOKEN.
 * When no token is configured every helper returns null and the UI falls back
 * to a monogram, so a missing key never breaks a page.
 */

export type LogoSize = "xs" | "sm" | "md" | "lg" | "xl";
export type LogoType = "full" | "badge" | "wordmark";

/** Pixel size of each Motomarks preset. */
export const LOGO_PX: Record<LogoSize, number> = { xs: 64, sm: 128, md: 256, lg: 512, xl: 1024 };

/**
 * Our catalog slugs that differ from Motomarks brand ids. Motomarks uses
 * lowercase hyphenated brand names ("mercedes-benz", "land-rover"); sub-brands
 * and tuner lines that Motomarks does not carry map to their parent brand.
 */
const ALIASES: Record<string, string> = {
  "mercedes-amg": "mercedes-benz",
  mercedes: "mercedes-benz",
  "mercedes-maybach": "maybach",
  "bmw-m": "bmw",
  "audi-sport": "audi",
  chevy: "chevrolet",
  vw: "volkswagen",
  alfa: "alfa-romeo",
  aston: "aston-martin",
  "land-rover-range-rover": "land-rover",
  "range-rover": "land-rover",
  ruf: "ruf",
  shelby: "shelby",
};

export function slugifyMake(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Motomarks brand id for a make name or catalog slug. */
export function motomarksId(makeOrSlug: string): string {
  const slug = slugifyMake(makeOrSlug);
  return ALIASES[slug] ?? slug;
}

export function motomarksToken(): string | null {
  const t = process.env.NEXT_PUBLIC_MOTOMARKS_TOKEN?.trim();
  return t ? t : null;
}

export interface LogoOptions {
  size?: LogoSize;
  type?: LogoType;
  format?: "webp" | "png";
  /** square pads to a square; height keeps the aspect ratio at a fixed height. */
  aspect?: "square" | "height";
}

/** Image URL for a brand, or null when no token is configured. */
export function brandLogoUrl(
  makeOrSlug: string,
  opts: LogoOptions = {},
  token: string | null = motomarksToken(),
): string | null {
  if (!token) return null;
  const id = motomarksId(makeOrSlug);
  if (!id) return null;
  const p = new URLSearchParams({
    size: opts.size ?? "sm",
    type: opts.type ?? "badge",
    format: opts.format ?? "webp",
    aspect: opts.aspect ?? "square",
    token,
  });
  return `https://motomarks.io/img/${encodeURIComponent(id)}?${p.toString()}`;
}

/** One or two letter monogram used when no logo is available ("Porsche" → "P", "Aston Martin" → "AM"). */
export function monogram(name: string): string {
  const words = name
    .replace(/[^A-Za-z0-9 -]/g, " ")
    .split(/[\s-]+/)
    .filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 1).toUpperCase();
  return (words[0]!.slice(0, 1) + words[1]!.slice(0, 1)).toUpperCase();
}
