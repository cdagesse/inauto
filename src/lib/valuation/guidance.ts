import type { MarketSnapshot } from "@/lib/market/types";
import type { ValuationConfig } from "./config";
import { median, round500, usd, valuate } from "./engine";
import type { PriceGuidance, PriceVerdict, ValuationInputs } from "./types";

export const VERDICT_THRESHOLDS = { tooLow: -0.12, low: -0.04, fair: 0.06, high: 0.15 } as const;

export function verdictFor(deltaPct: number): PriceVerdict {
  if (deltaPct < VERDICT_THRESHOLDS.tooLow) return "too_low";
  if (deltaPct < VERDICT_THRESHOLDS.low) return "low";
  if (deltaPct <= VERDICT_THRESHOLDS.fair) return "fair";
  if (deltaPct <= VERDICT_THRESHOLDS.high) return "high";
  return "too_high";
}

/**
 * Seller-side price check: is this asking price too high or low against
 * what dealers are asking and what auctions have actually paid?
 */
export function priceGuidance(
  snapshot: MarketSnapshot,
  inputs: ValuationInputs & { askingPrice: number },
  config?: Partial<ValuationConfig> | null,
): PriceGuidance {
  const { askingPrice, ...valInputs } = inputs;
  const v = valuate(snapshot, valInputs, config);
  const gen = snapshot.generations[valInputs.generation];
  const soldAuctions = snapshot.auctions.filter(
    (r) => r.status === "sold" && r.generation === valInputs.generation,
  );
  const auctionMedian = soldAuctions.length >= 3 ? median(soldAuctions.map((r) => r.price)) : null;
  const asking = Math.max(0, Math.round(askingPrice));
  const deltaPct = v.marketValue > 0 ? (asking - v.marketValue) / v.marketValue : 0;
  const verdict = verdictFor(deltaPct);
  const pct = `${Math.abs(Math.round(deltaPct * 100))}%`;
  const dealerTxt = `Dealers are asking a median of ${usd(gen.activeMedian)} for ${gen.name} cars right now`;
  const aucTxt = auctionMedian
    ? `, and recent auctions have hammered at a median of ${usd(round500(auctionMedian))}`
    : ", and there are too few recent auction sales to compare against";
  const thinTxt = v.thin
    ? " Few recent sales for this generation, so treat the estimate as a starting point."
    : "";

  let message: string;
  switch (verdict) {
    case "too_low":
      message = `Your price is ${pct} under our estimated market value of ${usd(v.marketValue)}. ${dealerTxt}${aucTxt}. You are likely leaving money on the table; consider asking closer to ${usd(v.privateSale.asking)}.`;
      break;
    case "low":
      message = `Your price is ${pct} under our estimated market value of ${usd(v.marketValue)}. It should sell quickly. ${dealerTxt}${aucTxt}.`;
      break;
    case "fair":
      message = `Your price is in line with our estimated market value of ${usd(v.marketValue)}. ${dealerTxt}${aucTxt}.`;
      break;
    case "high":
      message = `Your price is ${pct} over our estimated market value of ${usd(v.marketValue)}. ${dealerTxt}${aucTxt}. Expect a slower sale unless the car has a spec or history that comps don't capture.`;
      break;
    default:
      message = `Your price is ${pct} over our estimated market value of ${usd(v.marketValue)}. ${dealerTxt}${aucTxt}. At this level buyers will pass; a realistic asking price is about ${usd(v.privateSale.asking)}.`;
  }
  message += thinTxt + " This is an estimate, not an offer.";

  return {
    marketValue: v.marketValue,
    range: v.range,
    dealerAskingMedian: gen.activeMedian,
    auctionMedian: auctionMedian == null ? null : round500(auctionMedian),
    suggestedAsking: v.privateSale.asking,
    askingPrice: asking,
    deltaPct,
    verdict,
    message,
    comps: v.comps,
    thin: v.thin,
  };
}
