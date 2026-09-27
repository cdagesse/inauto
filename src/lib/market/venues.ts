/**
 * Which auction venue gets the most money for a car like this one. Pure:
 * works off the auction rows already in a MarketSnapshot, so the model
 * page, the sell page and car pages all agree.
 */
import type { AuctionRow, MarketSnapshot } from "./types";

export interface VenueRow {
  platform: string;
  /** All results on this platform for the generation. */
  n: number;
  sold: number;
  /** sold / n, 0..1 */
  sellThrough: number;
  medianHammer: number | null;
  medianMiles: number | null;
  /** Results within the mileage band around the car (sold only). */
  similar: number;
  similarMedian: number | null;
  /** similarMedian (or medianHammer) against the generation's dealer median. */
  vsDealer: number | null;
  /** Most recent result on this platform, YYYY-MM-DD. */
  latest: string | null;
}

export interface VenueComparison {
  generation: string;
  miles: number | null;
  /** Mileage band used for "similar", null when no mileage was given. */
  band: { lo: number; hi: number } | null;
  dealerMedian: number;
  venues: VenueRow[];
  /** Best venue for a car like this, or null when the sample is too thin. */
  best: VenueRow | null;
  runnerUp: VenueRow | null;
  /** Why `best` won, one sentence. */
  reason: string | null;
}

const MIN_RESULTS = 3;
const MIN_SOLD = 2;
/** Price gap under which two venues are treated as tied. */
const TIE = 0.03;

function median(a: number[]): number | null {
  if (a.length === 0) return null;
  const s = [...a].sort((x, y) => x - y);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : Math.round((s[m - 1]! + s[m]!) / 2);
}

/** Mileage band: ±40%, but never narrower than ±5,000 miles, floored at 0. */
export function mileageBand(miles: number): { lo: number; hi: number } {
  const half = Math.max(5_000, Math.round(miles * 0.4));
  return { lo: Math.max(0, miles - half), hi: miles + half };
}

/** Price a venue is judged on: similar-mileage median when the sample allows, else all sold. */
export function venuePrice(v: VenueRow): number | null {
  return v.similar >= MIN_SOLD && v.similarMedian != null ? v.similarMedian : v.medianHammer;
}

export function compareVenues(
  snapshot: MarketSnapshot,
  input: { generation: string; miles?: number | null },
): VenueComparison {
  const generation = snapshot.order.includes(input.generation)
    ? input.generation
    : snapshot.order[0]!;
  const g = snapshot.generations[generation]!;
  const miles = input.miles != null && input.miles >= 0 ? Math.round(input.miles) : null;
  const band = miles != null ? mileageBand(miles) : null;
  const rows = snapshot.auctions.filter((a) => a.generation === generation);

  const byPlatform = new Map<string, AuctionRow[]>();
  for (const r of rows) {
    const list = byPlatform.get(r.platform) ?? [];
    list.push(r);
    byPlatform.set(r.platform, list);
  }

  const venues: VenueRow[] = [...byPlatform.entries()].map(([platform, list]) => {
    const sold = list.filter((r) => r.status === "sold");
    const similar = band ? sold.filter((r) => r.miles >= band.lo && r.miles <= band.hi) : [];
    const medianHammer = median(sold.map((r) => r.price));
    const similarMedian = median(similar.map((r) => r.price));
    const row: VenueRow = {
      platform,
      n: list.length,
      sold: sold.length,
      sellThrough: list.length ? sold.length / list.length : 0,
      medianHammer,
      medianMiles: median(sold.map((r) => r.miles)),
      similar: similar.length,
      similarMedian,
      vsDealer: null,
      latest: list.reduce<string | null>(
        (acc, r) => (acc == null || r.endedAt > acc ? r.endedAt : acc),
        null,
      ),
    };
    const p = venuePrice(row);
    row.vsDealer = p != null && g.median > 0 ? (p - g.median) / g.median : null;
    return row;
  });

  // When any venue has enough similar-mileage sales, only those venues compete:
  // a concours house with four low-mile sales must not "win" for a 147k-mile car.
  const similarMode = !!band && venues.some((v) => v.similar >= MIN_SOLD);
  const eligible = venues.filter(
    (v) =>
      v.n >= MIN_RESULTS &&
      v.sold >= MIN_SOLD &&
      venuePrice(v) != null &&
      (!similarMode || v.similar >= MIN_SOLD),
  );
  // Near-ties on price (within 3%) go to the venue that actually sells more of what it lists.
  eligible.sort((a, b) => {
    const pa = venuePrice(a)!;
    const pb = venuePrice(b)!;
    const gap = Math.abs(pa - pb) / Math.max(pa, pb);
    if (gap < TIE) {
      if (b.sellThrough !== a.sellThrough) return b.sellThrough - a.sellThrough;
      return (similarMode ? b.similar - a.similar : b.sold - a.sold) || pb - pa;
    }
    return pb - pa;
  });
  // Table order: venues we can judge first, then the rest by sample size.
  const eligibleSet = new Set(eligible.map((v) => v.platform));
  venues.sort((a, b) => {
    const ea = eligibleSet.has(a.platform) ? 1 : 0;
    const eb = eligibleSet.has(b.platform) ? 1 : 0;
    if (ea !== eb) return eb - ea;
    if (ea) return eligible.indexOf(a) - eligible.indexOf(b);
    return b.n - a.n;
  });
  const best = eligible[0] ?? null;
  const runnerUp = eligible[1] ?? null;

  let reason: string | null = null;
  if (best) {
    const price = venuePrice(best)!;
    const basis = similarMode
      ? `${best.similar} sales within ${band!.lo.toLocaleString("en-US")} to ${band!.hi.toLocaleString("en-US")} miles`
      : `${best.sold} ${g.name} sales`;
    const pct = (v: VenueRow) => `${Math.round(v.sellThrough * 100)}%`;
    if (runnerUp) {
      const rp = venuePrice(runnerUp)!;
      const gap = rp > 0 ? (price - rp) / rp : 0;
      reason =
        Math.abs(gap) < TIE
          ? `${best.platform} and ${runnerUp.platform} land within ${Math.abs(Math.round(gap * 100))}% of each other on ${basis}; ${best.platform} edges it by selling ${pct(best)} of what it lists against ${pct(runnerUp)}.`
          : `${best.platform} runs ${Math.round(gap * 100)}% above ${runnerUp.platform} on ${basis}, and sells ${pct(best)} of its ${g.name} auctions.`;
    } else {
      reason = `${best.platform} is the only venue with enough ${g.name} results to judge: ${basis}, ${pct(best)} sold.`;
    }
  }

  return { generation, miles, band, dealerMedian: g.median, venues, best, runnerUp, reason };
}
