/**
 * US regions for the Markets page. Dealer sales carry a state; auction results carry one
 * in their raw JSON. Six regions keep every one big enough for a 90-day read.
 */
export interface Region {
  key: string;
  name: string;
  short: string;
  blurb: string;
  states: string[];
}

export const REGIONS: Region[] = [
  {
    key: "northeast",
    name: "Northeast",
    short: "Northeast",
    blurb: "New England, New York, New Jersey and Pennsylvania.",
    states: ["CT", "ME", "MA", "NH", "RI", "VT", "NJ", "NY", "PA"],
  },
  {
    key: "southeast",
    name: "Southeast",
    short: "Southeast",
    blurb: "Florida, Georgia, the Carolinas, Virginia and the Mid-Atlantic.",
    states: ["DE", "MD", "DC", "VA", "WV", "NC", "SC", "GA", "FL"],
  },
  {
    key: "south-central",
    name: "South Central",
    short: "South Central",
    blurb: "Texas, Oklahoma, Louisiana, Arkansas, Tennessee, Kentucky, Alabama and Mississippi.",
    states: ["TX", "OK", "LA", "AR", "TN", "KY", "AL", "MS"],
  },
  {
    key: "midwest",
    name: "Midwest",
    short: "Midwest",
    blurb: "The Great Lakes and the Plains, from Ohio to Kansas.",
    states: ["OH", "MI", "IN", "IL", "WI", "MN", "IA", "MO", "ND", "SD", "NE", "KS"],
  },
  {
    key: "mountain",
    name: "Mountain West",
    short: "Mountain West",
    blurb: "Arizona, Colorado, Nevada, Utah, New Mexico, Idaho, Montana and Wyoming.",
    states: ["AZ", "CO", "NV", "UT", "NM", "ID", "MT", "WY"],
  },
  {
    key: "west-coast",
    name: "West Coast",
    short: "West Coast",
    blurb: "California, Oregon and Washington, plus Alaska and Hawaii.",
    states: ["CA", "OR", "WA", "AK", "HI"],
  },
];

/** Full state names, upper-cased, for rows that carry a name instead of a code. */
const STATE_NAMES: Record<string, string> = {
  ALABAMA: "AL",
  ALASKA: "AK",
  ARIZONA: "AZ",
  ARKANSAS: "AR",
  CALIFORNIA: "CA",
  COLORADO: "CO",
  CONNECTICUT: "CT",
  DELAWARE: "DE",
  "DISTRICT OF COLUMBIA": "DC",
  "WASHINGTON DC": "DC",
  "WASHINGTON, DC": "DC",
  FLORIDA: "FL",
  GEORGIA: "GA",
  HAWAII: "HI",
  IDAHO: "ID",
  ILLINOIS: "IL",
  INDIANA: "IN",
  IOWA: "IA",
  KANSAS: "KS",
  KENTUCKY: "KY",
  LOUISIANA: "LA",
  MAINE: "ME",
  MARYLAND: "MD",
  MASSACHUSETTS: "MA",
  MICHIGAN: "MI",
  MINNESOTA: "MN",
  MISSISSIPPI: "MS",
  MISSOURI: "MO",
  MONTANA: "MT",
  NEBRASKA: "NE",
  NEVADA: "NV",
  "NEW HAMPSHIRE": "NH",
  "NEW JERSEY": "NJ",
  "NEW MEXICO": "NM",
  "NEW YORK": "NY",
  "NORTH CAROLINA": "NC",
  "NORTH DAKOTA": "ND",
  OHIO: "OH",
  OKLAHOMA: "OK",
  OREGON: "OR",
  PENNSYLVANIA: "PA",
  "RHODE ISLAND": "RI",
  "SOUTH CAROLINA": "SC",
  "SOUTH DAKOTA": "SD",
  TENNESSEE: "TN",
  TEXAS: "TX",
  UTAH: "UT",
  VERMONT: "VT",
  VIRGINIA: "VA",
  WASHINGTON: "WA",
  "WEST VIRGINIA": "WV",
  WISCONSIN: "WI",
  WYOMING: "WY",
};

const REGION_OF = new Map<string, Region>();
for (const r of REGIONS) for (const s of r.states) REGION_OF.set(s, r);

/** Two-letter code for a state as stored ("CA", " ca ", "Ohio"), or null when unknown. */
export function normalizeState(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim().toUpperCase().replace(/\./g, "");
  if (!s) return null;
  if (REGION_OF.has(s)) return s;
  return STATE_NAMES[s] ?? null;
}

export function regionForState(raw: string | null | undefined): Region | null {
  const code = normalizeState(raw);
  return code ? (REGION_OF.get(code) ?? null) : null;
}

export function regionByKey(key: string): Region | null {
  return REGIONS.find((r) => r.key === key) ?? null;
}

/** Every spelling a state column may hold, mapped to its region, for a SQL VALUES join. */
export function stateSpellings(): { spelling: string; region: string }[] {
  const out: { spelling: string; region: string }[] = [];
  for (const r of REGIONS) for (const s of r.states) out.push({ spelling: s, region: r.key });
  for (const [name, code] of Object.entries(STATE_NAMES)) {
    const r = REGION_OF.get(code);
    if (r) out.push({ spelling: name, region: r.key });
  }
  return out;
}
