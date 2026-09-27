/**
 * Vitu (developer.vitu.com) client for title checks.
 *
 * Auth is OAuth 2.0 client credentials against Vitu's Keycloak realm
 * (form-encoded, scope `oneapi:access`), per Vitu's migration guide:
 *   sandbox: https://auth.test.vitu.com/realms/api/protocol/openid-connect/token
 *            API https://api-test.vitu.com
 *   stage:   https://auth.stage.vitu.com/…  API https://api-stage.vitu.com
 *   prod:    https://auth.secure.vitu.com/… API https://api.vitu.com
 *
 * The NMVTIS / theft-and-lien endpoint path and its response shape are set by
 * the API spec in Vitu's portal (login only). They live in VITU_TITLE_PATH
 * and parseTitleReport(); everything else here is spec-independent.
 */
import { z } from "zod";

export interface VituConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  apiBase: string;
  scope: string;
  /** Path of the title/NMVTIS report endpoint, e.g. "/nmvtis/v2/reports". "{vin}" is substituted when present. */
  titlePath: string;
  /** "GET" sends the VIN in the path/query; "POST" sends {"vin": …} as JSON. */
  titleMethod: "GET" | "POST";
  fetchImpl?: typeof fetch;
}

const tokenSchema = z.object({
  access_token: z.string(),
  expires_in: z.number().optional(),
  token_type: z.string().optional(),
});

let cached: { token: string; exp: number; key: string } | null = null;

export class VituError extends Error {
  constructor(
    public readonly step: "token" | "report",
    public readonly status: number,
    detail: string,
  ) {
    super(`Vitu ${step} failed (${status})${detail ? `: ${detail}` : ""}`);
    this.name = "VituError";
  }
}

/** Client-credentials token, cached in memory until a minute before expiry. */
export async function getVituToken(c: VituConfig, now = Date.now()): Promise<string> {
  const key = `${c.authUrl}|${c.clientId}|${c.scope}`;
  if (cached && cached.key === key && cached.exp > now) return cached.token;
  const f = c.fetchImpl ?? fetch;
  const res = await f(c.authUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: c.scope,
    }),
  });
  const text = await res.text();
  if (!res.ok) throw new VituError("token", res.status, text.slice(0, 200));
  const parsed = tokenSchema.safeParse(JSON.parse(text));
  if (!parsed.success) throw new VituError("token", res.status, "unexpected token response");
  const ttl = (parsed.data.expires_in ?? 300) * 1000;
  cached = { token: parsed.data.access_token, exp: now + Math.max(ttl - 60_000, 30_000), key };
  return parsed.data.access_token;
}

/** Calls the title report endpoint for a VIN and returns the raw JSON body. */
export async function fetchTitleReportRaw(c: VituConfig, vin: string): Promise<unknown> {
  const token = await getVituToken(c);
  const f = c.fetchImpl ?? fetch;
  const path = c.titlePath.includes("{vin}")
    ? c.titlePath.replace("{vin}", encodeURIComponent(vin))
    : c.titlePath;
  const url = `${c.apiBase.replace(/\/$/, "")}${path}`;
  const res =
    c.titleMethod === "POST"
      ? await f(url, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({ vin }),
        })
      : await f(
          c.titlePath.includes("{vin}")
            ? url
            : `${url}${url.includes("?") ? "&" : "?"}vin=${encodeURIComponent(vin)}`,
          {
            method: "GET",
            headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
          },
        );
  const text = await res.text();
  if (!res.ok) throw new VituError("report", res.status, text.slice(0, 300));
  try {
    return JSON.parse(text);
  } catch {
    throw new VituError("report", res.status, "response was not JSON");
  }
}

/** What we show buyers. Every field is best-effort; `flags` is the headline. */
export interface TitleSummary {
  vin: string;
  checkedAt: string;
  brands: string[];
  theft: boolean | null;
  liens: number | null;
  lienHolders: string[];
  titleRecords: number | null;
  lastTitleState: string | null;
  lastOdometer: number | null;
  odometerIssue: boolean | null;
  /** Human-readable red flags, empty when clean. */
  flags: string[];
  /** "clean" | "issues" | "unknown" */
  verdict: "clean" | "issues" | "unknown";
}

const asArray = (v: unknown): unknown[] => (Array.isArray(v) ? v : v == null ? [] : [v]);
const str = (v: unknown): string | null =>
  typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : null;
const num = (v: unknown): number | null => {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string" && /^\d[\d,]*$/.test(v.trim())) return Number(v.replace(/,/g, ""));
  return null;
};
const bool = (v: unknown): boolean | null =>
  typeof v === "boolean"
    ? v
    : typeof v === "string"
      ? /^(true|yes|y)$/i.test(v)
        ? true
        : /^(false|no|n)$/i.test(v)
          ? false
          : null
      : null;

/** Depth-first search for the first key matching any of the names (case-insensitive). */
function find(obj: unknown, names: string[], depth = 0): unknown {
  if (depth > 6 || obj == null || typeof obj !== "object") return undefined;
  const want = names.map((n) => n.toLowerCase());
  if (Array.isArray(obj)) {
    for (const item of obj) {
      const r = find(item, names, depth + 1);
      if (r !== undefined) return r;
    }
    return undefined;
  }
  for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
    if (want.includes(k.toLowerCase())) return v;
  }
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const r = find(v, names, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/**
 * Turns a raw NMVTIS-style report into our summary. Written against the
 * NMVTIS data model (brands, title records with state and odometer, theft
 * and lien indicators) with tolerant key matching, so it survives naming
 * differences; tighten it against Vitu's spec once we have it.
 */
export function parseTitleReport(raw: unknown, vin: string, now = new Date()): TitleSummary {
  const brandSrc = find(raw, [
    "brands",
    "brandHistory",
    "brand_records",
    "titleBrands",
    "vehicleBrands",
  ]);
  const brands = asArray(brandSrc)
    .map((b) =>
      typeof b === "string"
        ? b
        : (str(find(b, ["brandName", "name", "brand", "description", "code"])) ?? null),
    )
    .filter((b): b is string => !!b);

  const theftRaw = find(raw, [
    "theft",
    "stolen",
    "theftIndicator",
    "reportedStolen",
    "theftRecords",
    "theft_records",
  ]);
  const theft = Array.isArray(theftRaw)
    ? theftRaw.length > 0
    : (bool(theftRaw) ??
      (theftRaw && typeof theftRaw === "object"
        ? bool(find(theftRaw, ["stolen", "indicator", "found", "hasRecords"]))
        : null));

  const lienRaw = find(raw, ["liens", "lienRecords", "lien_records", "lienholders", "lienHolders"]);
  const lienList = asArray(lienRaw);
  const lienCount = Array.isArray(lienRaw)
    ? lienList.length
    : num(find(raw, ["lienCount", "activeLiens", "numberOfLiens"]));
  const lienHolders = lienList
    .map((l) =>
      typeof l === "string"
        ? l
        : str(find(l, ["lienholderName", "lienHolderName", "name", "holder"])),
    )
    .filter((x): x is string => !!x);

  const records = asArray(
    find(raw, ["titleRecords", "title_records", "titles", "titleHistory", "history"]),
  );
  const last = records[0] ?? null;
  const lastTitleState = str(
    find(last ?? raw, ["titleState", "state", "jurisdiction", "issuingState"]),
  );
  const odoRaw = find(last ?? raw, ["odometer", "odometerReading", "mileage", "odometer_reading"]);
  const lastOdometer = num(
    typeof odoRaw === "object" && odoRaw ? find(odoRaw, ["reading", "value", "miles"]) : odoRaw,
  );
  const odometerIssue = bool(
    find(raw, ["odometerIssue", "odometerDiscrepancy", "odometerRollback", "odometer_problem"]),
  );

  const flags: string[] = [];
  for (const b of brands) flags.push(`Title brand: ${b}`);
  if (theft) flags.push("Reported stolen");
  if (lienCount && lienCount > 0)
    flags.push(
      `${lienCount} lien${lienCount === 1 ? "" : "s"} on record${lienHolders.length ? ` (${lienHolders.join(", ")})` : ""}`,
    );
  if (odometerIssue) flags.push("Odometer discrepancy");

  const known = brands.length > 0 || theft != null || lienCount != null || records.length > 0;
  return {
    vin,
    checkedAt: now.toISOString(),
    brands,
    theft: theft ?? null,
    liens: lienCount ?? null,
    lienHolders,
    titleRecords: records.length || null,
    lastTitleState,
    lastOdometer,
    odometerIssue,
    flags,
    verdict: !known ? "unknown" : flags.length ? "issues" : "clean",
  };
}
