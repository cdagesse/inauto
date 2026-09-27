/**
 * Vitu Motor Vehicle Record (MVR) verification: an asynchronous, per-state
 * inquiry that returns the live DMV record (owner, lienholder, registration,
 * title) as a unified cross-state record. Modelled on Vitu's MVR developer
 * guide: CreateInquiry → callback (transactionCompleted) or polling →
 * LoadUnifiedInquiryRecord. Concrete paths and field names come from the
 * spec (portal login) and are configured, not hard-coded.
 */
import { type VituConfig, vituCall } from "./vitu";

export interface MvrConfig extends VituConfig {
  /** Base of the MVR API, e.g. https://api-test.vitu.com/lookup-national-vr-public-api/v1 */
  apiBase: string;
  /** POST: create an inquiry (spec: /inquiry). */
  createPath: string;
  /** GET: unified record by inquiry id; "{id}" is substituted (LoadUnifiedInquiryRecord, /inquiry/{id}/vitu-record). */
  unifiedPath: string;
  /** GET: inquiry status by id; "{id}" is substituted (LoadInquiryById). Optional. */
  inquiryPath?: string | null;
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
  const raw = await vituCall<unknown>(
    c,
    "POST",
    c.createPath,
    inquiryBody(req, {
      ...(c.stateExtras?.["*"] ?? {}),
      ...(c.stateExtras?.[req.state.toUpperCase()] ?? {}),
    }),
  );
  return { inquiryId: pickNumber(raw, ["inquiryId", "id"]), raw };
}

export async function loadUnifiedRecord(c: MvrConfig, inquiryId: number): Promise<MvrRecord> {
  return vituCall<MvrRecord>(c, "GET", c.unifiedPath.replace("{id}", String(inquiryId)));
}

/** LoadInquiryById. Throws VituError; the caller decides whether that is fatal. */
export async function loadInquiryStatus(
  c: MvrConfig,
  inquiryId: number,
): Promise<MvrInquiryStatus | null> {
  if (!c.inquiryPath) return null;
  return vituCall<MvrInquiryStatus>(c, "GET", c.inquiryPath.replace("{id}", String(inquiryId)));
}

/** LoadInquiryByRefNumber. Throws VituError; the caller decides whether that is fatal. */
export async function loadInquiryByRef(
  c: MvrConfig,
  refNumber: string,
): Promise<MvrInquiryStatus | null> {
  if (!c.loadByRefPath) return null;
  return vituCall<MvrInquiryStatus>(
    c,
    "GET",
    c.loadByRefPath.replace("{ref}", encodeURIComponent(refNumber)),
  );
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
/** Display name for an MVRBaseOwnerDTO / MVRBaseLessorDTO: name, else business, else first middle last suffix. */
export function partyName(section: MvrParty | null | undefined): string | null {
  if (!section || typeof section !== "object") return null;
  const direct = str(section.name) ?? str(section.businessName);
  if (direct) return direct;
  const parts = [section.firstName, section.middleName, section.lastName, section.suffix]
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

/** MVRBaseRecordDTO, as returned by GET /inquiry/{inquiryId}/vitu-record. */
export interface MvrParty {
  ownerType?: string | null;
  name?: string | null;
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  suffix?: string | null;
  businessName?: string | null;
}
export interface MvrRecord {
  vehicle?: {
    vin?: string | null;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    odometerReading?: number | null;
    odometerReadingDate?: string | null;
    odometerValidity?: string | null;
    isVehicleStop?: boolean | null;
    purchaseDate?: string | null;
    sellingPrice?: number | null;
  } | null;
  title?: {
    titleNumber?: string | null;
    titleType?: string | null;
    titlingState?: string | null;
    titleIssueDate?: string | null;
    plateNumber?: string | null;
    plateExpirationDate?: string | null;
    registrationNumber?: string | null;
  } | null;
  owners?: MvrParty[] | null;
  lienholders?:
    | {
        lienholderId?: string | null;
        name?: string | null;
        lienDate?: string | null;
        electronicLien?: boolean | null;
      }[]
    | null;
  lessor?:
    | (MvrParty & {
        leaseStartDate?: string | null;
        leaseEndDate?: string | null;
        electronicLease?: boolean | null;
      })
    | null;
  registration?: {
    expirationDate?: string | null;
    plateNumber?: string | null;
    plateExpirationDate?: string | null;
    plateType?: string | null;
    address?: {
      street?: string | null;
      city?: string | null;
      state?: string | null;
      zipCode?: string | null;
    } | null;
  } | null;
}

/** InquiryDTO status fields, as returned by LoadInquiryById / LoadInquiryByRefNumber. */
export interface MvrInquiryStatus {
  inquiryId?: number | null;
  processedDate?: string | null;
  charged?: boolean | null;
  error?: string | null;
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
  vehicle: string | null;
  owner: string | null;
  coOwner: string | null;
  ownerType: string | null;
  ownerMatch: "match" | "partial" | "mismatch" | "unknown";
  lienholder: string | null;
  lienDate: string | null;
  lessor: string | null;
  registrationState: string | null;
  registrationExpires: string | null;
  registrationExpired: boolean | null;
  plateNumber: string | null;
  titleState: string | null;
  titleNumber: string | null;
  titleType: string | null;
  titleIssued: string | null;
  odometer: number | null;
  odometerDate: string | null;
  vehicleStop: boolean;
  flags: string[];
  verdict: "verified" | "issues" | "pending" | "unknown";
}

const isPast = (d: string | null, now: Date) =>
  d && !Number.isNaN(Date.parse(d)) ? Date.parse(d) < now.getTime() : null;

/** True once the state has returned anything substantive for the inquiry. */
export function recordHasContent(r: MvrRecord | null | undefined): boolean {
  if (!r || typeof r !== "object") return false;
  return !!(
    str(r.vehicle?.vin) ||
    (r.owners && r.owners.length) ||
    str(r.title?.titleNumber) ||
    str(r.registration?.expirationDate) ||
    str(r.registration?.plateNumber)
  );
}

/**
 * Summarises the unified MVR record (MVRBaseRecordDTO) plus, when available,
 * the inquiry status (processedDate / error) against what the seller told us.
 */
export function summarizeMvr(
  record: MvrRecord | null | undefined,
  ctx: {
    vin: string;
    state: string;
    refNumber: string;
    inquiryId: number | null;
    sellerName: string | null;
    listingMiles?: number | null;
    inquiry?: MvrInquiryStatus | null;
    now?: Date;
  },
): MvrSummary {
  const now = ctx.now ?? new Date();
  const r: MvrRecord = record && typeof record === "object" ? record : {};
  const error = str(ctx.inquiry?.error);
  const processedDate = str(ctx.inquiry?.processedDate);
  const hasContent = recordHasContent(r);
  const processed = hasContent || !!processedDate || !!error;

  const vehicle = r.vehicle ?? null;
  const title = r.title ?? null;
  const owners = (r.owners ?? []).filter((o) => o && typeof o === "object");
  const lienholders = (r.lienholders ?? []).filter((l) => l && typeof l === "object");
  const registration = r.registration ?? null;

  const vinOnRecord = str(vehicle?.vin)?.toUpperCase() ?? null;
  const vinMatches = vinOnRecord ? vinOnRecord === ctx.vin.toUpperCase() : null;
  const vehicleDesc =
    [vehicle?.year, str(vehicle?.make), str(vehicle?.model)].filter(Boolean).join(" ") || null;
  const ownerNames = owners.map(partyName).filter((n): n is string => !!n);
  const ownerName = ownerNames[0] ?? null;
  const coOwner = ownerNames.slice(1).join(", ") || null;
  const lienNames = lienholders.map((l) => str(l.name)).filter((n): n is string => !!n);
  const lienName = lienNames.join(", ") || null;
  const lienDate = str(lienholders[0]?.lienDate);
  const lessorName = partyName(r.lessor);
  const regState = str(registration?.address?.state)?.toUpperCase() ?? null;
  const regExp =
    str(registration?.expirationDate) ??
    str(registration?.plateExpirationDate) ??
    str(title?.plateExpirationDate);
  const regExpired = isPast(regExp, now);
  const titleState = str(title?.titlingState)?.toUpperCase() ?? null;
  const odometer = typeof vehicle?.odometerReading === "number" ? vehicle.odometerReading : null;
  const vehicleStop = vehicle?.isVehicleStop === true;

  let ownerMatch: MvrSummary["ownerMatch"] = "unknown";
  for (const n of ownerNames) {
    const m = compareNames(n, ctx.sellerName);
    if (m === "match") {
      ownerMatch = "match";
      break;
    }
    if (m === "partial" || (m === "mismatch" && ownerMatch === "unknown")) ownerMatch = m;
  }

  const flags: string[] = [];
  if (error) flags.push(`State lookup error: ${error}`);
  if (vinMatches === false) flags.push(`VIN on record (${vinOnRecord}) does not match the listing`);
  if (ownerMatch === "mismatch")
    flags.push(`Registered owner (${ownerNames.join(", ")}) does not match the seller`);
  if (ownerMatch === "partial")
    flags.push(`Registered owner (${ownerNames.join(", ")}) only partly matches the seller`);
  if (lienName)
    flags.push(`Lienholder on record: ${lienName}${lienDate ? ` (since ${lienDate})` : ""}`);
  if (lessorName) flags.push(`Leased vehicle; lessor on record: ${lessorName}`);
  if (vehicleStop) flags.push("State has a stop on this vehicle");
  if (regState && regState !== ctx.state.toUpperCase())
    flags.push(`Registered in ${regState}, listing says ${ctx.state.toUpperCase()}`);
  else if (!regState && titleState && titleState !== ctx.state.toUpperCase())
    flags.push(`Titled in ${titleState}, listing says ${ctx.state.toUpperCase()}`);
  if (regExpired) flags.push(`Registration expired ${regExp}`);
  if (odometer != null && typeof ctx.listingMiles === "number" && ctx.listingMiles + 500 < odometer)
    flags.push(
      `Listing shows ${ctx.listingMiles.toLocaleString()} miles but the state's last odometer reading was ${odometer.toLocaleString()}${vehicle?.odometerReadingDate ? ` on ${vehicle.odometerReadingDate}` : ""}`,
    );
  if (
    str(vehicle?.odometerValidity) &&
    !/^(actual|ok|valid|true)$/i.test(vehicle!.odometerValidity!)
  )
    flags.push(`Odometer status on record: ${vehicle!.odometerValidity}`);

  return {
    vin: ctx.vin,
    state: ctx.state,
    inquiryId: ctx.inquiryId,
    refNumber: ctx.refNumber,
    processed,
    error,
    vinOnRecord,
    vinMatches,
    vehicle: vehicleDesc,
    owner: ownerName,
    coOwner,
    ownerType: str(owners[0]?.ownerType),
    ownerMatch,
    lienholder: lienName,
    lienDate,
    lessor: lessorName,
    registrationState: regState,
    registrationExpires: regExp,
    registrationExpired: regExpired,
    plateNumber: str(registration?.plateNumber) ?? str(title?.plateNumber),
    titleState,
    titleNumber: str(title?.titleNumber),
    titleType: str(title?.titleType),
    titleIssued: str(title?.titleIssueDate),
    odometer,
    odometerDate: str(vehicle?.odometerReadingDate),
    vehicleStop,
    flags,
    verdict: !processed
      ? "pending"
      : !hasContent
        ? "unknown"
        : flags.length
          ? "issues"
          : "verified",
  };
}
