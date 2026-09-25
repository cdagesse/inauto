import type { AuctionRow, DealerSalePoint, MarketSnapshot } from "@/lib/market/types";
import { resolveConfig, yearOverride, type ValuationConfig } from "./config";
import type { Adjustment, CompRow, ValuationInputs, ValuationResult } from "./types";

export const DISCLAIMER = "This is an estimate, not an offer.";

/* ------------------------------------------------------------------ */
/* Math helpers                                                        */
/* ------------------------------------------------------------------ */

export function median(values: number[]): number | null {
  if (!values.length) return null;
  const s = [...values].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

export function round500(v: number): number {
  return Math.round(v / 500) * 500;
}

export interface LogLogFit {
  a: number;
  b: number;
  /** 25th and 75th percentile of residuals in log space. */
  q25: number;
  q75: number;
  n: number;
}

/**
 * Least-squares fit of ln(price) = a + b * ln(miles + offset).
 * Residual quantiles use the prototype's index rule: floor(f * (n - 1)).
 */
export function fitLogLog(points: DealerSalePoint[], offset = 250): LogLogFit | null {
  const n = points.length;
  if (n < 2) return null;
  const X = points.map((p) => Math.log(p.miles + offset));
  const Y = points.map((p) => Math.log(p.price));
  const mx = X.reduce((s, v) => s + v, 0) / n;
  const my = Y.reduce((s, v) => s + v, 0) / n;
  let sxy = 0;
  let sxx = 0;
  for (let i = 0; i < n; i++) {
    sxy += (X[i] - mx) * (Y[i] - my);
    sxx += (X[i] - mx) ** 2;
  }
  if (sxx === 0) return null;
  const b = sxy / sxx;
  const a = my - b * mx;
  const res = Y.map((y, i) => y - (a + b * X[i])).sort((p, q) => p - q);
  const q = (f: number) => res[Math.floor(f * (n - 1))];
  return { a, b, q25: q(0.25), q75: q(0.75), n };
}

/* ------------------------------------------------------------------ */
/* Engine                                                              */
/* ------------------------------------------------------------------ */

export interface AuctionGap {
  gap: number;
  n: number;
  estimated: boolean;
}

export function auctionGap(
  snapshot: MarketSnapshot,
  generation: string,
  cfg: ValuationConfig,
): AuctionGap {
  const sold = snapshot.auctions.filter((r) => r.status === "sold" && r.generation === generation);
  if (sold.length < cfg["auction.gap_min_sales"]) {
    return { gap: cfg["auction.gap_default"], n: sold.length, estimated: true };
  }
  const m = median(sold.map((r) => r.price)) as number;
  const dealerMedian = snapshot.generations[generation].median;
  return { gap: (m - dealerMedian) / dealerMedian, n: sold.length, estimated: false };
}

function hasWeissach(inputs: ValuationInputs) {
  return inputs.packages.includes("weissach");
}

function packageMatch(row: AuctionRow, inputs: ValuationInputs) {
  return row.weissach === hasWeissach(inputs) ? 0 : 1;
}

function buildComps(
  snapshot: MarketSnapshot,
  inputs: ValuationInputs,
  cfg: ValuationConfig,
): CompRow[] {
  const miles = inputs.miles;
  const dist = (m: number) => Math.abs(m - miles);
  const auctions = snapshot.auctions
    .filter((r) => r.generation === inputs.generation)
    .sort(
      (x, y) => packageMatch(x, inputs) - packageMatch(y, inputs) || dist(x.miles) - dist(y.miles),
    )
    .slice(0, cfg["comps.max_auction"])
    .map<CompRow>((r) => ({
      source: r.platform,
      miles: r.miles,
      price: r.price,
      url: r.url,
      rnm: r.status === "rnm",
      year: r.year,
      packages: r.weissach ? ["weissach"] : [],
    }));
  const dealerCount = Math.max(3, cfg["comps.total"] - auctions.length);
  const dealers = (snapshot.dealerSales[inputs.generation] ?? [])
    .slice()
    .sort((x, y) => dist(x.miles) - dist(y.miles))
    .slice(0, dealerCount)
    .map<CompRow>((p) => ({ source: "Dealer sale", miles: p.miles, price: p.price }));
  return [...auctions, ...dealers].sort((x, y) => x.miles - y.miles);
}

/**
 * Pure valuation. Takes market data plus inputs plus config and returns every
 * number the page, the API and the listing price guidance display.
 */
export function valuate(
  snapshot: MarketSnapshot,
  inputs: ValuationInputs,
  config?: Partial<ValuationConfig> | null,
): ValuationResult {
  const cfg = resolveConfig(config);
  const gen = snapshot.generations[inputs.generation];
  if (!gen) throw new Error(`Unknown generation: ${inputs.generation}`);
  const miles = Math.max(0, Math.floor(Number.isFinite(inputs.miles) ? inputs.miles : 0));
  const offset = cfg["fit.miles_offset"];

  /* Step 1: base market value */
  const points = snapshot.dealerSales[inputs.generation] ?? [];
  const fit = points.length >= cfg["fit.min_sales"] ? fitLogLog(points, offset) : null;
  let base: number;
  let loMul: number;
  let hiMul: number;
  let basis: string;
  let thin: boolean;
  if (fit) {
    base = Math.exp(fit.a + fit.b * Math.log(miles + offset));
    loMul = Math.exp(fit.q25);
    hiMul = Math.exp(fit.q75);
    basis = `${fit.n} dealer sales`;
    thin = false;
  } else {
    const override = yearOverride(inputs.generation, inputs.year);
    const useYear = override ? override.useYear : inputs.year;
    const yearRow = snapshot.byYear.find(
      (r) => r.year === useYear && r.generation === inputs.generation,
    );
    const y = yearRow && yearRow.n >= cfg["thin.year_min_sales"] ? yearRow : null;
    const med = y ? y.median : gen.median;
    const medMiles = y ? y.medianMiles : gen.medianMiles;
    base = med * Math.pow((miles + offset) / (medMiles + offset), cfg["thin.miles_elasticity"]);
    loMul = cfg["thin.lo"];
    hiMul = cfg["thin.hi"];
    basis = `${y ? y.n : gen.sold} dealer sales (thin)`;
    thin = true;
  }

  /* Step 2: multiplicative adjustments */
  const adjustments: Adjustment[] = [];
  let mult = 1;
  const add = (key: string, label: string) => {
    const pct = cfg[key] ?? 0;
    if (pct) {
      mult *= 1 + pct;
      adjustments.push({ key, label, pct });
    }
  };
  if (hasWeissach(inputs) && gen.packages.includes("weissach")) {
    add(`adj.package.weissach.${inputs.generation}`, "Weissach package");
  }
  if (inputs.colorClass === "spec") add("adj.color.spec", "Special color");
  if (inputs.colorClass === "pts") add("adj.color.pts", "Paint to Sample");
  if (inputs.condition === "good") add("adj.condition.good", "Good condition");
  if (inputs.condition === "fair") add("adj.condition.fair", "Needs work");
  if (inputs.history === "acc") add("adj.history.acc", "Accident on history report");
  const marketValue = base * mult;

  /* Step 3: channel outcomes */
  const ag = auctionGap(snapshot, inputs.generation, cfg);
  const hammer = marketValue * (1 + ag.gap);
  const buyerFee = Math.min(
    cfg["auction.buyer_cap"],
    Math.max(cfg["auction.buyer_min"], hammer * cfg["auction.buyer_pct"]),
  );
  const auctionNet = hammer - cfg["auction.listing_fee"] - cfg["auction.prep"];

  const margin =
    cfg["dealer.base"] +
    cfg["dealer.per_dom"] * gen.daysToSell +
    (gen.thin ? cfg["dealer.thin"] : 0);
  const offer = marketValue * (1 - margin);

  const asking = marketValue * cfg["private.ask"];
  const likelySale = marketValue * cfg["private.sale"];
  const privateNet = likelySale - cfg["private.cost"];

  /* Step 4: recommendation */
  const diff = auctionNet - offer;
  const threshold = Math.max(cfg["rec.min_abs"], cfg["rec.min_pct"] * marketValue);
  const issues = inputs.history === "acc" || inputs.condition === "fair";
  let recommendation: Omit<ValuationResult["recommendation"], "edgeOverDealer">;
  if (issues) {
    recommendation = {
      channel: "dealer",
      title: "Sell to a dealer",
      reason:
        "Auction bidders pick apart condition issues and accident history in the comments, which tends to push hammer prices down further than a dealer's offer. A dealer sale is the cleaner path; get two or three written offers.",
    };
  } else if (diff > threshold) {
    recommendation = {
      channel: "auction",
      title: "Auction it",
      reason: `An online auction should net you about ${usd(round500(diff))} more than a dealer offer. Set the reserve near ${usd(round500(hammer * cfg["auction.reserve_pct"]))} and expect bidding to finish around ${usd(round500(hammer))}.`,
    };
  } else {
    recommendation = {
      channel: "dealer",
      title: "Sell to a dealer",
      reason: `An auction would net only about ${usd(round500(Math.max(0, diff)))} more than a dealer offer, which isn't worth the weeks of waiting and the risk of a no-sale. Take the dealer's money.`,
    };
  }

  return {
    inputs: { ...inputs, miles },
    basis,
    thin,
    base: round500(base),
    adjustments,
    marketValue: round500(marketValue),
    range: { lo: round500(marketValue * loMul), hi: round500(marketValue * hiMul) },
    auction: {
      gap: ag.gap,
      gapSampleSize: ag.n,
      gapEstimated: ag.estimated,
      expectedHammer: round500(hammer),
      range: { lo: round500(hammer * loMul), hi: round500(hammer * hiMul) },
      suggestedReserve: round500(hammer * cfg["auction.reserve_pct"]),
      buyerFee: Math.round(buyerFee),
      listingFee: cfg["auction.listing_fee"],
      prep: cfg["auction.prep"],
      net: round500(auctionNet),
      timeToCash: "about 3 to 6 weeks",
    },
    dealer: {
      margin,
      offer: round500(offer),
      range: {
        lo: round500(offer * cfg["dealer.range_lo"]),
        hi: round500(offer * cfg["dealer.range_hi"]),
      },
      net: round500(offer),
      timeToCash: "a day or two",
    },
    privateSale: {
      asking: round500(asking),
      likelySale: round500(likelySale),
      cost: cfg["private.cost"],
      net: round500(privateNet),
      minDays: Math.round(gen.daysToSell * cfg["private.days_multiple"]),
    },
    recommendation: { ...recommendation, edgeOverDealer: round500(diff) },
    comps: buildComps(snapshot, inputs, cfg),
    disclaimer: DISCLAIMER,
  };
}

/* ------------------------------------------------------------------ */
/* Formatting (shared by UI and messages)                              */
/* ------------------------------------------------------------------ */

export function usd(v: number | null | undefined): string {
  return v == null ? "n/a" : "$" + Math.round(v).toLocaleString("en-US");
}
export function usdK(v: number): string {
  return "$" + Math.round(v / 1000) + "k";
}
export function fmtMiles(v: number | null | undefined): string {
  return v == null ? "n/a" : Math.round(v).toLocaleString("en-US");
}
