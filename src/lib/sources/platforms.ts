/**
 * Third-party auction platforms we surface listings from. The key is what we
 * store in external_listing.source; the display name is what buyers see.
 */
export const PLATFORM_KEYS = [
  "bat",
  "carsandbids",
  "sothebys",
  "hagerty",
  "barrettjackson",
  "bonhams",
  "pcarmarket",
  "collectingcars",
  "other",
] as const;
export type PlatformKey = (typeof PLATFORM_KEYS)[number];

export interface Platform {
  key: PlatformKey;
  name: string;
  home: string;
  /** CSS token name for the badge colour (var(--<token>)). */
  colorToken: string;
  /** Host suffixes that identify this platform in a listing URL. */
  hosts: string[];
}

export const PLATFORMS: Record<PlatformKey, Platform> = {
  bat: {
    key: "bat",
    name: "Bring a Trailer",
    home: "https://bringatrailer.com",
    colorToken: "s2",
    hosts: ["bringatrailer.com"],
  },
  carsandbids: {
    key: "carsandbids",
    name: "Cars & Bids",
    home: "https://carsandbids.com",
    colorToken: "s1",
    hosts: ["carsandbids.com"],
  },
  sothebys: {
    key: "sothebys",
    name: "Sotheby's Motorsport",
    home: "https://www.sothebysmotorsport.com",
    colorToken: "ink-2",
    hosts: ["sothebysmotorsport.com", "rmsothebys.com"],
  },
  hagerty: {
    key: "hagerty",
    name: "Hagerty Marketplace",
    home: "https://www.hagerty.com/marketplace",
    colorToken: "s3",
    hosts: ["hagerty.com"],
  },
  barrettjackson: {
    key: "barrettjackson",
    name: "Barrett-Jackson",
    home: "https://www.barrett-jackson.com",
    colorToken: "flag",
    hosts: ["barrett-jackson.com"],
  },
  bonhams: {
    key: "bonhams",
    name: "Bonhams",
    home: "https://cars.bonhams.com",
    colorToken: "ink-2",
    hosts: ["bonhams.com"],
  },
  pcarmarket: {
    key: "pcarmarket",
    name: "PCARMARKET",
    home: "https://www.pcarmarket.com",
    colorToken: "s1",
    hosts: ["pcarmarket.com"],
  },
  collectingcars: {
    key: "collectingcars",
    name: "Collecting Cars",
    home: "https://collectingcars.com",
    colorToken: "s3",
    hosts: ["collectingcars.com"],
  },
  other: { key: "other", name: "Auction platform", home: "", colorToken: "ink-3", hosts: [] },
};

export function isPlatformKey(v: unknown): v is PlatformKey {
  return typeof v === "string" && (PLATFORM_KEYS as readonly string[]).includes(v);
}

/** Derive the platform from a listing URL's host. Unknown hosts map to "other". */
export function platformFromUrl(url: string | null | undefined): Platform {
  if (!url) return PLATFORMS.other;
  let host: string;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch {
    return PLATFORMS.other;
  }
  for (const p of Object.values(PLATFORMS)) {
    if (p.hosts.some((h) => host === h || host.endsWith(`.${h}`))) return p;
  }
  return PLATFORMS.other;
}

/** Derive the platform from a free-text name such as "Bring a Trailer" or "BaT". */
export function platformFromName(name: string | null | undefined): Platform {
  const n = (name ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (!n) return PLATFORMS.other;
  if (n.includes("bringatrailer") || n === "bat") return PLATFORMS.bat;
  if (n.includes("carsandbids") || n.includes("carsbids")) return PLATFORMS.carsandbids;
  if (n.includes("sotheby")) return PLATFORMS.sothebys;
  if (n.includes("hagerty")) return PLATFORMS.hagerty;
  if (n.includes("barrett")) return PLATFORMS.barrettjackson;
  if (n.includes("bonhams")) return PLATFORMS.bonhams;
  if (n.includes("pcarmarket")) return PLATFORMS.pcarmarket;
  if (n.includes("collectingcars")) return PLATFORMS.collectingcars;
  return PLATFORMS.other;
}

/** URL first, then the platform name the source gave us. Never returns null. */
export function resolvePlatform(url: string | null | undefined, name?: string | null): Platform {
  const byUrl = platformFromUrl(url);
  if (byUrl.key !== "other") return byUrl;
  return platformFromName(name);
}
