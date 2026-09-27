/**
 * Vitu (developer.vitu.com) client: OAuth token plus the NMVTIS
 * "Vehicle History Verification" inquiry API.
 *
 * Auth is OAuth 2.0 client credentials against Vitu's Keycloak realm
 * (form-encoded, scope `oneapi:access`):
 *   sandbox: https://auth.test.vitu.com/realms/api/protocol/openid-connect/token
 *   stage:   https://auth.stage.vitu.com/…
 *   prod:    https://auth.secure.vitu.com/…
 *
 * NMVTIS (base https://api-test.vitu.com/one/nmvtis/api/v1) is asynchronous:
 *   POST /inquiry { refNumber, vin, stockNumber? }  -> { inquiryId }
 *   GET  /inquiry/id/{inquiryId}                    -> InquiryResponseDTO (processedDate, error)
 *   GET  /inquiry/{inquiryId}/record                -> InquiryRecordDTO (titles, brands, dispositions)
 *   GET  /inquiry/{inquiryId}/report                -> PDF
 * Completion is announced through the matching Notifications product (same base).
 */
import { z } from "zod";

export interface VituConfig {
  clientId: string;
  clientSecret: string;
  authUrl: string;
  scope: string;
  fetchImpl?: typeof fetch;
  /** Called with every non-token response's status and headers (for diagnostics). */
  onResponse?: (info: {
    method: string;
    url: string;
    status: number;
    headers: Record<string, string>;
  }) => void;
}

export interface NmvtisConfig extends VituConfig {
  /** e.g. https://api-test.vitu.com/one/nmvtis/api/v1 */
  apiBase: string;
  locationId?: string | null;
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

/** Authenticated JSON call against a product base. Shared by the NMVTIS, MVR and Notifications clients. */
export async function vituCall<T>(
  c: VituConfig & { apiBase: string; locationId?: string | null },
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getVituToken(c);
  const f = c.fetchImpl ?? fetch;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: "application/json",
  };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (c.locationId) headers["x-location-id"] = c.locationId;
  const res = await f(`${c.apiBase.replace(/\/$/, "")}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  if (c.onResponse) {
    const headers: Record<string, string> = {};
    res.headers.forEach((val, key) => {
      headers[key] = val;
    });
    c.onResponse({
      method,
      url: `${c.apiBase.replace(/\/$/, "")}${path}`,
      status: res.status,
      headers,
    });
  }
  if (!res.ok) throw new VituError("report", res.status, text.slice(0, 500));
  if (!text.trim()) return {} as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new VituError("report", res.status, "response was not JSON");
  }
}

/** True for 4xx statuses that mean "not ready / not found yet" rather than auth or config errors. */
export const isNotReady = (e: unknown) =>
  e instanceof VituError &&
  e.status >= 400 &&
  e.status < 500 &&
  e.status !== 401 &&
  e.status !== 403 &&
  e.status !== 429;

// ---------------------------------------------------------------------------
// NMVTIS inquiry API
// ---------------------------------------------------------------------------

export interface NmvtisInquiryStatus {
  inquiryId?: number | null;
  refNumber?: string | null;
  vin?: string | null;
  stockNumber?: string | null;
  error?: string | null;
  processedDate?: string | null;
}

/** A field the spec types as an array but the API may return as a single object. */
type Many<T> = T[] | T | null | undefined;
export const many = <T>(v: Many<T>): T[] =>
  Array.isArray(v) ? v.filter((x) => x != null) : v == null ? [] : [v];

/**
 * InquiryRecordDTO. `titlingState` may be a jurisdiction code such as "C6", not only
 * USPS codes. The sandbox returns some list fields as bare objects; use `many()`.
 */
export interface NmvtisTitle {
  odometerReading?: string | null;
  titleIssueDate?: string | null;
  titlingState?: string | null;
}
export interface NmvtisBrand {
  brand?: string | null;
  brandDate?: string | null;
  reportingEntityName?: string | null;
  isBrand?: boolean | null;
}
export interface NmvtisDisposition {
  dateObtained?: string | null;
  entityName?: string | null;
  entityAddress?: string | null;
  entityPhone?: string | null;
  entityEmail?: string | null;
  reportingEntityType?: string | null;
  vehicleDisposition?: string | null;
}
export interface NmvtisRecord {
  previousTitle?: Many<NmvtisTitle>;
  title?: Many<NmvtisTitle>;
  vehicle?: Many<{ vin?: string | null }>;
  vehicleBrands?: Many<NmvtisBrand>;
  vehicleDisposition?: Many<NmvtisDisposition>;
}

export async function createNmvtisInquiry(
  c: NmvtisConfig,
  req: { vin: string; refNumber: string; stockNumber?: string | null },
): Promise<{ inquiryId: number | null; raw: unknown }> {
  const body: Record<string, unknown> = { refNumber: req.refNumber, vin: req.vin.toUpperCase() };
  if (req.stockNumber) body.stockNumber = req.stockNumber;
  const raw = await vituCall<{ inquiryId?: number }>(c, "POST", "/inquiry", body);
  return { inquiryId: typeof raw?.inquiryId === "number" ? raw.inquiryId : null, raw };
}

export function loadNmvtisInquiry(c: NmvtisConfig, inquiryId: number) {
  return vituCall<NmvtisInquiryStatus>(c, "GET", `/inquiry/id/${inquiryId}`);
}

export function loadNmvtisInquiryByRef(c: NmvtisConfig, refNumber: string) {
  return vituCall<NmvtisInquiryStatus>(
    c,
    "GET",
    `/inquiry/refNumber/${encodeURIComponent(refNumber)}`,
  );
}

export function loadNmvtisRecord(c: NmvtisConfig, inquiryId: number) {
  return vituCall<NmvtisRecord>(c, "GET", `/inquiry/${inquiryId}/record`);
}

/** What we show buyers. `flags` is the headline. */
export interface TitleSummary {
  vin: string;
  checkedAt: string;
  inquiryId: number | null;
  refNumber: string | null;
  processed: boolean;
  error: string | null;
  vinOnRecord: string | null;
  /** Brands as reported, e.g. "Salvage (2019-03-01, NY DMV)". */
  brands: string[];
  /** Junk / salvage / insurance dispositions, e.g. "Salvage — Progressive Insurance (2019-02-14)". */
  dispositions: string[];
  /** Newest first: current title(s) then previous titles. */
  titleHistory: {
    state: string | null;
    issued: string | null;
    odometer: number | null;
    current: boolean;
  }[];
  titleRecords: number;
  lastTitleState: string | null;
  lastOdometer: number | null;
  odometerIssue: boolean;
  flags: string[];
  verdict: "clean" | "issues" | "pending" | "unknown";
}

/** Brands that are pure odometer disclosures rather than damage/condition brands. */
const ODOMETER_OK = /^(actual milage|actual mileage|exempt from odometer disclosure)$/i;
const ODOMETER_BAD = /odometer|not actual|exceeds mechanical/i;

const odo = (v: string | null | undefined): number | null => {
  if (v == null) return null;
  const s = String(v).trim();
  if (!/^\d[\d,]*$/.test(s)) return null;
  return Number(s.replace(/,/g, ""));
};
const strv = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

export function recordHasContent(r: NmvtisRecord | null | undefined): boolean {
  if (!r || typeof r !== "object") return false;
  return !!(
    many(r.title).length ||
    many(r.previousTitle).length ||
    many(r.vehicle).some((v) => strv(v?.vin)) ||
    many(r.vehicleBrands).length ||
    many(r.vehicleDisposition).length
  );
}

/** Summarises an NMVTIS InquiryRecordDTO (plus inquiry status when known) against the listing. */
export function summarizeNmvtis(
  record: NmvtisRecord | null | undefined,
  ctx: {
    vin: string;
    inquiryId?: number | null;
    refNumber?: string | null;
    inquiry?: NmvtisInquiryStatus | null;
    listingMiles?: number | null;
    now?: Date;
  },
): TitleSummary {
  const now = ctx.now ?? new Date();
  const r: NmvtisRecord = record && typeof record === "object" ? record : {};
  const error = strv(ctx.inquiry?.error);
  const hasContent = recordHasContent(r);
  const processed = hasContent || !!strv(ctx.inquiry?.processedDate) || !!error;

  const vinOnRecord =
    many(r.vehicle)
      .map((v) => strv(v?.vin))
      .find(Boolean)
      ?.toUpperCase() ?? null;
  const toTitle = (t: NmvtisTitle, current: boolean) => ({
    state: strv(t?.titlingState)?.toUpperCase() ?? null,
    issued: strv(t?.titleIssueDate),
    odometer: odo(t?.odometerReading),
    current,
  });
  const byDateDesc = (a: { issued: string | null }, b: { issued: string | null }) =>
    (Date.parse(b.issued ?? "") || 0) - (Date.parse(a.issued ?? "") || 0);
  const titleHistory = [
    ...many(r.title)
      .map((t) => toTitle(t, true))
      .sort(byDateDesc),
    ...many(r.previousTitle)
      .map((t) => toTitle(t, false))
      .sort(byDateDesc),
  ];
  const brandRows = many(r.vehicleBrands).filter((b) => strv(b.brand));
  const brands = brandRows.map((b) => {
    const meta = [strv(b.brandDate), strv(b.reportingEntityName)].filter(Boolean).join(", ");
    return `${b.brand!.trim()}${meta ? ` (${meta})` : ""}`;
  });
  const dispositions = many(r.vehicleDisposition)
    .filter((d) => strv(d.vehicleDisposition) || strv(d.entityName))
    .map((d) => {
      const what = strv(d.vehicleDisposition) ?? "Reported";
      const who = [strv(d.entityName), strv(d.reportingEntityType)].filter(Boolean).join(", ");
      const when = strv(d.dateObtained);
      return `${what}${who ? ` — ${who}` : ""}${when ? ` (${when})` : ""}`;
    });

  const latest = titleHistory[0] ?? null;
  const lastOdometer =
    titleHistory.map((t) => t.odometer).find((n): n is number => n != null) ?? null;
  const odometerBrand = brandRows.some(
    (b) => ODOMETER_BAD.test(b.brand!) && !ODOMETER_OK.test(b.brand!),
  );
  // Readings should not decrease over time (history is newest-first, so each later entry should be <=).
  const readings = [...titleHistory]
    .filter((t) => t.odometer != null && t.issued)
    .sort((a, b) => -byDateDesc(a, b));
  let rollback = false;
  for (let i = 1; i < readings.length; i++)
    if (readings[i]!.odometer! + 100 < readings[i - 1]!.odometer!) rollback = true;
  const listingBelowRecord =
    lastOdometer != null &&
    typeof ctx.listingMiles === "number" &&
    ctx.listingMiles + 500 < lastOdometer;
  const odometerIssue = odometerBrand || rollback || listingBelowRecord;

  const flags: string[] = [];
  if (error) flags.push(`NMVTIS lookup error: ${error}`);
  if (vinOnRecord && vinOnRecord !== ctx.vin.toUpperCase())
    flags.push(`VIN on record (${vinOnRecord}) does not match the listing`);
  for (const b of brandRows) {
    if (ODOMETER_OK.test(b.brand!)) continue;
    flags.push(`Title brand: ${b.brand!.trim()}${strv(b.brandDate) ? ` (${b.brandDate})` : ""}`);
  }
  for (const d of dispositions) flags.push(`Junk/salvage/insurance record: ${d}`);
  if (rollback) flags.push("Odometer readings on title history decrease over time");
  if (listingBelowRecord)
    flags.push(
      `Listing shows ${ctx.listingMiles!.toLocaleString("en-US")} miles but the last title reading was ${lastOdometer!.toLocaleString("en-US")}`,
    );

  return {
    vin: ctx.vin,
    checkedAt: now.toISOString(),
    inquiryId: ctx.inquiryId ?? null,
    refNumber: ctx.refNumber ?? null,
    processed,
    error,
    vinOnRecord,
    brands,
    dispositions,
    titleHistory,
    titleRecords: titleHistory.length,
    lastTitleState: latest?.state ?? null,
    lastOdometer,
    odometerIssue,
    flags,
    verdict: !processed ? "pending" : !hasContent ? "unknown" : flags.length ? "issues" : "clean",
  };
}
