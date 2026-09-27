/**
 * Vitu Motor Vehicle Record (MVR) verification: an asynchronous, per-state
 * inquiry that returns the live DMV record (owner, lienholder, registration,
 * title) as a unified cross-state record. Modelled on Vitu's MVR developer
 * guide: CreateInquiry → callback (transactionCompleted) or polling →
 * LoadUnifiedInquiryRecord. Concrete paths and field names come from the
 * spec (portal login) and are configured, not hard-coded.
 */
import { getVituToken, type VituConfig, VituError } from "./vitu";

export interface MvrConfig extends Omit<VituConfig, "titlePath" | "titleMethod"> {
  /** Base of the MVR API, e.g. https://api-test.vitu.com/lookup-national-vr-public-api/v1 */
  apiBase: string;
  /** POST: create an inquiry (spec: /inquiry). */
  createPath: string;
  /** GET: unified record by inquiry id; "{id}" is substituted (LoadUnifiedInquiryRecord). */
  unifiedPath: string | null;
  /** GET: inquiry by reference number; "{ref}" is substituted (LoadInquiryByRefNumber). */
  loadByRefPath?: string | null;
  /** Optional x-location-id header value (integer). */
  locationId?: string | null;
  /** Per-state extra fields some states require (CA ids, TX dealer number, …), keyed by state. */
  stateExtras?: Record<string, Record<string, unknown>> | null;
}

export interface MvrInquiryRequest {
  state: string; // two-letter MvrStateEnum, the StateInquiryDTO discriminator
  vin: string;
  refNumber: string; // our UUID (InquiryDTO.refNumber)
}

async function call<T>(
  c: MvrConfig,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getVituToken({ ...c, titlePath: "", titleMethod: "POST" });
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
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new VituError("report", res.status, text.slice(0, 300));
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new VituError("report", res.status, "response was not JSON");
  }
}

/** InquiryDTO body for a VIN lookup, plus any state-specific extras. Pure, for tests. */
export function inquiryBody(
  req: MvrInquiryRequest,
  extras?: Record<string, unknown> | null,
): Record<string, unknown> & {
  state: string;
  refNumber: string;
  inquiryString: string;
  inquiryType: "VIN";
} {
  return {
    state: req.state.toUpperCase(),
    refNumber: req.refNumber,
    inquiryString: req.vin.toUpperCase(),
    inquiryType: "VIN" as const,
    ...(extras ?? {}),
  };
}

/** CreateInquiry (POST /inquiry). Returns InquiryIdResponseDTO.inquiryId. */
export async function createMvrInquiry(
  c: MvrConfig,
  req: MvrInquiryRequest,
): Promise<{ inquiryId: number | null; raw: unknown }> {
  const raw = await call<unknown>(
    c,
    "POST",
    c.createPath,
    inquiryBody(req, c.stateExtras?.[req.state.toUpperCase()]),
  );
  return { inquiryId: pickNumber(raw, ["inquiryId", "id"]), raw };
}

export async function loadUnifiedRecord(c: MvrConfig, inquiryId: number): Promise<unknown> {
  if (!c.unifiedPath) throw new VituError("report", 0, "VITU_MVR_UNIFIED_PATH not set");
  return call<unknown>(c, "GET", c.unifiedPath.replace("{id}", String(inquiryId)));
}

export async function loadInquiryByRef(c: MvrConfig, refNumber: string): Promise<unknown> {
  if (!c.loadByRefPath) throw new VituError("report", 0, "VITU_MVR_LOAD_BY_REF_PATH not set");
  return call<unknown>(c, "GET", c.loadByRefPath.replace("{ref}", encodeURIComponent(refNumber)));
}

/* ---------- pure helpers ---------- */

const US_STATES = new Set(
  "AL AK AZ AR CA CO CT DE DC FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY".split(
    " ",
  ),
);

/** "Hauppauge, NY" → "NY"; "Scottsdale AZ 85251" → "AZ"; null when no state is recognisable. */
export function stateFromLocation(location: string | null | undefined): string | null {
  if (!location) return null;
  const m =
    location.toUpperCase().match(/\b([A-Z]{2})\b(?:\s+\d{5})?\s*$/) ??
    location.toUpperCase().match(/,\s*([A-Z]{2})\b/);
  const s = m?.[1];
  return s && US_STATES.has(s) ? s : null;
}

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
  for (const [k, v] of Object.entries(obj as Record<string, unknown>))
    if (want.includes(k.toLowerCase())) return v;
  for (const v of Object.values(obj as Record<string, unknown>)) {
    const r = find(v, names, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}
function pickNumber(obj: unknown, names: string[]): number | null {
  const v = find(obj, names);
  return typeof v === "number" ? v : typeof v === "string" && /^\d+$/.test(v) ? Number(v) : null;
}
const str = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim() : null);

/** Full name from a party section: "name" or first/middle/last, or a business name. */
export function partyName(section: unknown): string | null {
  if (!section || typeof section !== "object") return typeof section === "string" ? section : null;
  const direct = str(
    find(section, ["fullName", "name", "businessName", "companyName", "ownerName"]),
  );
  if (direct) return direct;
  const parts = [
    find(section, ["firstName"]),
    find(section, ["middleName"]),
    find(section, ["lastName"]),
  ]
    .map(str)
    .filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

/** Tokens, with "Last, First" reordered to "First Last" so the last name is always final. */
const normName = (s: string) =>
  (s.includes(",") ? s.split(",").slice(1).concat(s.split(",")[0]!).join(" ") : s)
    .toLowerCase()
    .replace(/[^a-z ]/g, " ")
    .replace(/\b(jr|sr|ii|iii|iv|llc|inc|corp|ltd|co)\b/g, " ")
    .split(/\s+/)
    .filter(Boolean);

/** "match" when last names agree and a first-name token overlaps; "partial" on last name only. */
const NICKNAMES: string[][] = [
  ["james", "jim", "jimmy", "jamie"],
  ["robert", "rob", "bob", "bobby", "robbie"],
  ["william", "will", "bill", "billy", "liam"],
  ["richard", "rick", "dick", "rich", "richie"],
  ["michael", "mike", "mick", "mickey"],
  ["john", "jack", "johnny", "jon"],
  ["joseph", "joe", "joey"],
  ["thomas", "tom", "tommy"],
  ["charles", "chuck", "charlie", "chas"],
  ["christopher", "chris", "kit"],
  ["anthony", "tony"],
  ["edward", "ed", "eddie", "ted", "ned"],
  ["daniel", "dan", "danny"],
  ["david", "dave", "davey"],
  ["patrick", "pat", "paddy"],
  ["patricia", "pat", "patty", "trish"],
  ["elizabeth", "liz", "beth", "betty", "eliza", "lisa"],
  ["margaret", "meg", "peggy", "maggie", "marge"],
  ["katherine", "kate", "kathy", "katie", "catherine", "cathy"],
  ["jennifer", "jen", "jenny"],
  ["susan", "sue", "susie"],
  ["stephen", "steve", "steven"],
  ["andrew", "andy", "drew"],
  ["matthew", "matt"],
  ["nicholas", "nick"],
  ["alexander", "alex", "sasha"],
  ["samuel", "sam", "sammy"],
  ["benjamin", "ben", "benny"],
  ["theodore", "theo", "ted", "teddy"],
  ["frederick", "fred", "freddie"],
  ["donald", "don", "donnie"],
  ["ronald", "ron", "ronnie"],
  ["kenneth", "ken", "kenny"],
  ["lawrence", "larry"],
  ["gerald", "gerry", "jerry"],
  ["raymond", "ray"],
  ["timothy", "tim", "timmy"],
  ["jeffrey", "jeff"],
  ["gregory", "greg"],
  ["peter", "pete"],
  ["francis", "frank", "fran"],
  ["vincent", "vince", "vinny"],
  ["leonard", "leo", "len", "lenny"],
  ["walter", "walt", "wally"],
  ["harold", "harry", "hal"],
  ["henry", "hank", "harry"],
  ["albert", "al", "bert"],
  ["arthur", "art", "artie"],
  ["eugene", "gene"],
  ["douglas", "doug"],
  ["dennis", "denny"],
  ["gary", "gaz"],
  ["deborah", "deb", "debbie"],
  ["barbara", "barb", "babs"],
  ["dorothy", "dot", "dottie"],
  ["rebecca", "becky", "becca"],
  ["victoria", "vicky", "tori"],
  ["christine", "chris", "christy", "tina"],
  ["kimberly", "kim"],
  ["nancy", "nan"],
  ["sandra", "sandy"],
  ["cynthia", "cindy"],
  ["judith", "judy"],
  ["carolyn", "carol", "caroline"],
  ["joshua", "josh"],
  ["jonathan", "jon", "jonny"],
  ["zachary", "zach", "zack"],
  ["jacob", "jake"],
  ["nathan", "nate", "nathaniel"],
  ["maxwell", "max"],
  ["philip", "phil", "phillip"],
  ["russell", "russ"],
  ["stanley", "stan"],
  ["leonardo", "leo"],
  ["salvatore", "sal"],
  ["dominic", "dom"],
  ["louis", "lou", "louie"],
  ["abraham", "abe"],
  ["alfred", "al", "alf"],
  ["bernard", "bernie"],
  ["clifford", "cliff"],
  ["eleanor", "ellie", "nora"],
  ["gabriel", "gabe"],
  ["isabella", "bella", "izzy"],
  ["madeline", "maddie"],
  ["olivia", "liv", "livvy"],
  ["sophia", "sophie"],
  ["evelyn", "evie"],
  ["florence", "flo"],
  ["gertrude", "trudy"],
  ["josephine", "jo", "josie"],
  ["virginia", "ginny", "ginger"],
];
function sameNickname(a: string, b: string) {
  return NICKNAMES.some((g) => g.includes(a) && g.includes(b));
}

export function compareNames(
  a: string | null,
  b: string | null,
): "match" | "partial" | "mismatch" | "unknown" {
  if (!a || !b) return "unknown";
  const ta = normName(a);
  const tb = normName(b);
  if (!ta.length || !tb.length) return "unknown";
  const lastA = ta[ta.length - 1]!;
  const lastB = tb[tb.length - 1]!;
  const sameLast = lastA === lastB;
  const firstOverlap = ta
    .slice(0, -1)
    .some((t) => tb.slice(0, -1).some((u) => t === u || sameNickname(t, u)));
  if (sameLast && (firstOverlap || ta.length === 1 || tb.length === 1)) return "match";
  if (sameLast || ta.some((t) => tb.includes(t))) return "partial";
  return "mismatch";
}

export interface MvrSummary {
  vin: string;
  state: string;
  inquiryId: number | null;
  refNumber: string;
  processed: boolean;
  error: string | null;
  vinOnRecord: string | null;
  vinMatches: boolean | null;
  owner: string | null;
  coOwner: string | null;
  ownerMatch: "match" | "partial" | "mismatch" | "unknown";
  lienholder: string | null;
  lessor: string | null;
  registrationState: string | null;
  registrationExpires: string | null;
  registrationExpired: boolean | null;
  titleState: string | null;
  titleNumber: string | null;
  flags: string[];
  verdict: "verified" | "issues" | "pending" | "unknown";
}

/**
 * Summarises a unified MVR record (MVRBaseRecordDTO-style: vehicle, title,
 * owner, coOwner, lienholder, lessor, registration sections, all optional)
 * against what the seller told us. Tolerant key matching until the spec's
 * exact field names are wired in.
 */
export function summarizeMvr(
  record: unknown,
  ctx: {
    vin: string;
    state: string;
    refNumber: string;
    inquiryId: number | null;
    sellerName: string | null;
    now?: Date;
  },
): MvrSummary {
  const now = ctx.now ?? new Date();
  const inquiry = find(record, ["inquiry"]) ?? record;
  const processedDate = str(find(inquiry, ["processedDate", "processed_date", "completedDate"]));
  const error = str(find(inquiry, ["error", "errorMessage"]));
  const vehicle = find(record, ["vehicle"]);
  const title = find(record, ["title"]);
  const owner = find(record, ["owner", "registeredOwner", "primaryOwner"]);
  const coOwner = find(record, ["coOwner", "co_owner", "secondaryOwner"]);
  const lien = find(record, ["lienholder", "lienHolder", "lienholders", "lien"]);
  const lessor = find(record, ["lessor"]);
  const registration = find(record, ["registration"]);

  const vinOnRecord = str(find(vehicle ?? record, ["vin"]));
  const ownerName = partyName(owner);
  const coOwnerName = partyName(coOwner);
  const lienName = Array.isArray(lien) ? partyName(lien[0]) : partyName(lien);
  const lessorName = partyName(lessor);
  const regState = str(find(registration ?? {}, ["state", "jurisdiction", "registrationState"]));
  const regExp = str(
    find(registration ?? {}, [
      "expirationDate",
      "expiresOn",
      "expiration",
      "expires",
      "expirationDt",
    ]),
  );
  const regExpired =
    regExp && !Number.isNaN(Date.parse(regExp)) ? Date.parse(regExp) < now.getTime() : null;
  const titleState = str(find(title ?? {}, ["state", "titleState", "jurisdiction"]));
  const titleNumber = str(find(title ?? {}, ["titleNumber", "number", "titleNo"]));

  const ownerMatch = compareNames(ownerName, ctx.sellerName);
  const coOwnerMatch = compareNames(coOwnerName, ctx.sellerName);
  const effectiveOwner =
    ownerMatch === "match" || coOwnerMatch === "match"
      ? "match"
      : ownerMatch === "partial" || coOwnerMatch === "partial"
        ? "partial"
        : ownerMatch;
  const vinMatches = vinOnRecord ? vinOnRecord.toUpperCase() === ctx.vin.toUpperCase() : null;

  const processed = !!processedDate || !!ownerName || !!vinOnRecord;
  const flags: string[] = [];
  if (error) flags.push(`State lookup error: ${error}`);
  if (vinMatches === false) flags.push(`VIN on record (${vinOnRecord}) does not match the listing`);
  if (effectiveOwner === "mismatch")
    flags.push(`Registered owner (${ownerName}) does not match the seller`);
  if (effectiveOwner === "partial")
    flags.push(`Registered owner (${ownerName}) only partly matches the seller`);
  if (lienName) flags.push(`Lienholder on record: ${lienName}`);
  if (lessorName) flags.push(`Leased vehicle; lessor on record: ${lessorName}`);
  if (regState && regState.toUpperCase() !== ctx.state.toUpperCase())
    flags.push(`Registered in ${regState}, listing says ${ctx.state}`);
  if (regExpired) flags.push(`Registration expired ${regExp}`);

  return {
    vin: ctx.vin,
    state: ctx.state,
    inquiryId: ctx.inquiryId,
    refNumber: ctx.refNumber,
    processed,
    error,
    vinOnRecord,
    vinMatches,
    owner: ownerName,
    coOwner: coOwnerName,
    ownerMatch: effectiveOwner,
    lienholder: lienName,
    lessor: lessorName,
    registrationState: regState,
    registrationExpires: regExp,
    registrationExpired: regExpired,
    titleState,
    titleNumber,
    flags,
    verdict: !processed
      ? "pending"
      : error && !ownerName
        ? "unknown"
        : flags.length
          ? "issues"
          : "verified",
  };
}
