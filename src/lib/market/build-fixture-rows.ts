import type { MarketSnapshot } from "./types";
import type { BuildAuction, BuildDealerActive, BuildDealerSale } from "./build";

/**
 * Turns the frozen prototype snapshot into row-level demo data: one dealer
 * sale per scatter point, spread across months so monthly counts match the
 * prototype's trend table, with colors, states, days-on-market and model
 * years drawn from the prototype's aggregate tables. Deterministic (seeded
 * PRNG) so re-running the seed produces identical rows.
 *
 * This is demo data. Row-level truth comes from the nightly pipeline.
 */

export interface FixtureDealerRow extends BuildDealerSale {
  sourceListingId: string;
  generationCode: string;
}
export interface FixtureActiveRow extends BuildDealerActive {
  sourceListingId: string;
  generationCode: string;
  snapshotDate: string;
}
export interface FixtureAuctionRow extends BuildAuction {
  generationCode: string;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const OTHER_STATES = ["GA", "WA", "CO", "PA", "OH", "MA", "VA", "MI", "TN", "MN"];
const PALETTE = [
  "White",
  "Black",
  "GT Silver Metallic",
  "Guards Red",
  "Lizard Green",
  "Racing Yellow",
  "Miami Blue",
];

function daysInMonth(ym: string): number {
  const [y, m] = ym.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

function weightedPicker<T>(items: { value: T; weight: number }[], rand: () => number): () => T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  return () => {
    let r = rand() * total;
    for (const i of items) {
      r -= i.weight;
      if (r <= 0) return i.value;
    }
    return items[items.length - 1].value;
  };
}

export function fixtureToRows(
  snap: MarketSnapshot,
  seed = 20260919,
): {
  dealerSales: FixtureDealerRow[];
  dealerActive: FixtureActiveRow[];
  auctions: FixtureAuctionRow[];
} {
  const rand = mulberry32(seed);
  const dealerSales: FixtureDealerRow[] = [];
  const dealerActive: FixtureActiveRow[] = [];

  const stateWeights = snap.states.map((s) => ({ value: s.state, weight: s.n }));
  const known = snap.states.reduce((s, x) => s + x.n, 0);
  const rest = Math.max(0, snap.totals.dealerSales - known);
  for (const st of OTHER_STATES)
    stateWeights.push({ value: st, weight: rest / OTHER_STATES.length });
  const pickState = weightedPicker(stateWeights, rand);

  for (const code of snap.order) {
    const g = snap.generations[code];
    const pts = snap.dealerSales[code] ?? [];
    const yrs = snap.years[code] ?? [g.msrp ? 0 : 0];
    const yearWeights = yrs.map((y) => ({
      value: y,
      weight: snap.byYear.find((r) => r.year === y)?.n ?? 1,
    }));
    const pickYear = weightedPicker(yearWeights, rand);

    // Month assignment: fill months in order with the prototype's per-month counts.
    const months = snap.monthly.map((m) => ({
      ym: m.month,
      want: m.series[code]?.n ?? 0,
      partialStart: m.partial && m.month === snap.monthly[0].month,
      partialEnd: m.partial && m.month === snap.monthly[snap.monthly.length - 1].month,
    }));
    const dates: string[] = [];
    let cursor = 0;
    for (const m of months) {
      const take = Math.min(m.want, pts.length - cursor);
      const dim = daysInMonth(m.ym);
      const firstDay = m.partialStart ? Number(snap.dealerSince.slice(8)) : 1;
      const lastDay = m.partialEnd ? Number(snap.dataThrough.slice(8)) : dim;
      for (let k = 0; k < take; k++) {
        const day =
          take > 1 ? firstDay + Math.round((k / (take - 1)) * (lastDay - firstDay)) : firstDay;
        dates.push(`${m.ym}-${String(Math.min(day, lastDay)).padStart(2, "0")}`);
      }
      cursor += take;
    }
    // Leftover rows (prototype counted more sales than it plotted) land in the last full month.
    const spill = months[months.length - 2]?.ym ?? snap.dataThrough.slice(0, 7);
    while (dates.length < pts.length) dates.push(`${spill}-15`);

    // Colors: headline generation follows the prototype's color table (sorted by
    // median so the premium table keeps its ordering); others cycle a palette.
    const order = pts.map((p, i) => ({ p, i })).sort((a, b) => a.p.price - b.p.price);
    const colorAt = new Map<number, string | null>();
    if (code === snap.order[0]) {
      const seq: string[] = [];
      for (const c of [...snap.colors].sort((a, b) => a.median - b.median))
        for (let k = 0; k < c.n; k++) seq.push(c.color);
      const unlisted = pts.length - seq.length;
      let s = 0;
      order.forEach(({ i }, rank) => {
        const skip =
          unlisted > 0 &&
          Math.floor((rank * unlisted) / pts.length) !==
            Math.floor(((rank + 1) * unlisted) / pts.length);
        if (skip || s >= seq.length) colorAt.set(i, null);
        else colorAt.set(i, seq[s++]);
      });
    } else {
      pts.forEach((_, i) =>
        colorAt.set(i, rand() < 0.15 ? null : PALETTE[Math.floor(rand() * PALETTE.length)]),
      );
    }

    pts.forEach((p, i) => {
      const color = colorAt.get(i) ?? null;
      dealerSales.push({
        sourceListingId: `fx-${code}-${i}`,
        generationCode: code,
        generationId: null,
        year: pickYear(),
        miles: p.miles,
        price: p.price,
        color: color === "Paint to Sample" ? null : color,
        isPts: color === "Paint to Sample",
        packages: [],
        state: pickState(),
        daysOnMarket: Math.max(1, Math.round(g.daysToSell * (0.6 + 0.8 * rand()))),
        soldDate: dates[i],
        excludedReason: null,
      });
    });

    // Generations the prototype never plotted: synthesize from its by-year table.
    if (pts.length === 0) {
      let i = 0;
      for (const y of snap.byYear.filter((r) => r.generation === code)) {
        for (let k = 0; k < y.n; k++) {
          const monthIdx = Math.floor(rand() * (months.length - 1));
          const m = months[monthIdx];
          const firstDay = m.partialStart ? Number(snap.dealerSince.slice(8)) : 1;
          const lastDay = daysInMonth(m.ym);
          const day = firstDay + Math.floor(rand() * (lastDay - firstDay + 1));
          dealerSales.push({
            sourceListingId: `fx-${code}-${i++}`,
            generationCode: code,
            generationId: null,
            year: y.year,
            miles: Math.max(100, Math.round(y.medianMiles * (0.5 + rand()))),
            price: Math.round((y.median * (0.85 + 0.3 * rand())) / 100) * 100,
            color: rand() < 0.2 ? null : PALETTE[Math.floor(rand() * PALETTE.length)],
            isPts: false,
            packages: [],
            state: pickState(),
            daysOnMarket: Math.max(1, Math.round(g.daysToSell * (0.6 + 0.8 * rand()))),
            soldDate: `${m.ym}-${String(day).padStart(2, "0")}`,
            excludedReason: null,
          });
        }
      }
    }

    // Listed-now snapshot for the data-through day.
    for (let i = 0; i < g.active; i++) {
      dealerActive.push({
        sourceListingId: `fx-active-${code}-${i}`,
        generationCode: code,
        generationId: null,
        year: pickYear(),
        price: Math.round((g.activeMedian * (0.8 + 0.4 * rand())) / 100) * 100,
        miles: Math.max(10, Math.round(g.activeMedianMiles * (0.4 + 1.2 * rand()))),
        snapshotDate: snap.dataThrough,
      });
    }
  }

  // The prototype's recent-sales table, as real rows.
  snap.recentDealerSales.forEach((r, i) => {
    const g = snap.generations[r.generation];
    dealerSales.push({
      sourceListingId: `fx-recent-${i}`,
      generationCode: r.generation,
      generationId: null,
      year: r.year,
      miles: r.miles,
      price: r.price,
      color: r.color,
      isPts: false,
      packages: [],
      state: r.state,
      daysOnMarket: Math.max(1, Math.round((g?.daysToSell ?? 20) * (0.6 + 0.8 * rand()))),
      soldDate: r.soldDate,
      excludedReason: null,
    });
  });

  const auctions: FixtureAuctionRow[] = snap.auctions.map((a) => ({
    source: a.platform,
    sourceId: a.id,
    url: a.url,
    year: a.year,
    miles: a.miles,
    hammerPrice: a.price,
    status: a.status,
    endedAt: `${a.endedAt}T00:00:00Z`,
    packages: a.weissach ? ["weissach"] : [],
    generationId: null,
    generationCode: a.generation,
    excludedReason: null,
  }));

  return { dealerSales, dealerActive, auctions };
}
