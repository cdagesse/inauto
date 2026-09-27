/**
 * Market segments: the top level of the Markets drill-down. Every catalog
 * make belongs to exactly one segment; makes missing here land in "other".
 * Keys are URL slugs (/markets/{segment}).
 */
export interface Segment {
  key: string;
  name: string;
  short: string;
  blurb: string;
  makes: string[]; // make slugs
}

export const SEGMENTS: Segment[] = [
  {
    key: "supercars",
    name: "Supercars and hypercars",
    short: "Supercars",
    blurb:
      "Mid-engine exotics and limited-run hypercars, where provenance and mileage set the price.",
    makes: ["ferrari", "lamborghini", "mclaren", "pagani", "koenigsegg", "bugatti", "de-tomaso"],
  },
  {
    key: "luxury",
    name: "Luxury and grand touring",
    short: "Luxury",
    blurb:
      "Flagship saloons, coupes and SUVs from the luxury houses. Steep early depreciation, then a floor.",
    makes: [
      "bentley",
      "rolls-royce",
      "aston-martin",
      "maserati",
      "mercedes-benz",
      "jaguar",
      "land-rover",
      "lexus",
      "genesis",
      "cadillac",
      "lincoln",
    ],
  },
  {
    key: "european-performance",
    name: "European performance",
    short: "Euro performance",
    blurb:
      "Porsche, AMG, M and RS: the driver's cars that trade on spec, generation and track history.",
    makes: ["porsche", "mercedes-amg", "bmw", "audi", "alfa-romeo", "lotus", "volkswagen", "mini"],
  },
  {
    key: "american",
    name: "American and domestic",
    short: "Domestic",
    blurb: "Muscle, pony cars, trucks and modern American performance, from restomods to new EVs.",
    makes: [
      "ford",
      "chevrolet",
      "dodge",
      "shelby",
      "saleen",
      "pontiac",
      "plymouth",
      "oldsmobile",
      "buick",
      "amc",
      "gmc",
      "jeep",
      "hummer",
      "international",
      "delorean",
      "tesla",
      "rivian",
    ],
  },
  {
    key: "japanese",
    name: "Japanese and Korean",
    short: "JDM",
    blurb:
      "JDM icons and modern Japanese and Korean performance, the fastest-rising corner of the market.",
    makes: [
      "toyota",
      "nissan",
      "datsun",
      "honda",
      "acura",
      "mazda",
      "subaru",
      "mitsubishi",
      "hyundai",
      "kia",
    ],
  },
  {
    key: "british-classics",
    name: "British classics",
    short: "British classics",
    blurb:
      "Roadsters and sports cars from the British marques, bought for the drive as much as the return.",
    makes: ["austin-healey", "mg", "triumph", "morgan"],
  },
  {
    key: "other",
    name: "Other makes",
    short: "Other",
    blurb: "Makes not yet placed in a segment.",
    makes: [],
  },
];

const BY_MAKE = new Map<string, Segment>();
for (const s of SEGMENTS) for (const m of s.makes) BY_MAKE.set(m, s);

export function segmentForMake(makeSlug: string): Segment {
  return BY_MAKE.get(makeSlug) ?? SEGMENTS[SEGMENTS.length - 1]!;
}

export function segmentByKey(key: string): Segment | null {
  return SEGMENTS.find((s) => s.key === key) ?? null;
}
