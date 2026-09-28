/**
 * A car's history by VIN, stitched from every table that carries one:
 * dealer listings (active snapshots and sales), auction results, live
 * platform auctions, and UrCar listings. Pure: the query hands in rows,
 * this turns them into a timeline.
 */
export type EventKind =
  | "dealer_listed"
  | "dealer_sold"
  | "auction_sold"
  | "auction_rnm"
  | "auction_withdrawn"
  | "auction_live"
  | "auction_ended"
  | "inauto_listed"
  | "inauto_sold"
  | "inauto_ended";

export interface VinEvent {
  /** YYYY-MM-DD; the end of a span for dealer listings. */
  date: string;
  /** Start of a span, for dealer listings that were seen over several days. */
  from?: string;
  kind: EventKind;
  title: string;
  detail: string | null;
  price: number | null;
  miles: number | null;
  href: string | null;
  /** True for the listing the visitor is currently looking at. */
  current?: boolean;
}

export interface DealerRow {
  sourceListingId: string;
  price: number | null;
  miles: number | null;
  dealerName: string | null;
  state: string | null;
  /** Sale rows: the sold date. Active rows: the snapshot date. */
  date: string | null;
  listedAt: string | null;
  sold: boolean;
}

export interface AuctionResultRow {
  source: string;
  sourceId: string;
  url: string | null;
  status: "sold" | "rnm" | "withdrawn";
  price: number | null;
  miles: number | null;
  endedAt: string | null;
}

export interface ExternalRow {
  source: string;
  sourceName: string;
  sourceId: string;
  status: "live" | "sold" | "rnm" | "withdrawn" | "ended";
  currentBid: number | null;
  finalPrice: number | null;
  miles: number | null;
  endsAt: string | null;
}

export interface UrCarRow {
  id: string;
  status: "draft" | "active" | "ended" | "sold" | "withdrawn";
  type: "classified" | "auction" | "private";
  askingPrice: number | null;
  soldPrice: number | null;
  miles: number | null;
  createdAt: string;
  closedAt: string | null;
}

export interface VinRows {
  dealer: DealerRow[];
  auctions: AuctionResultRow[];
  external: ExternalRow[];
  inauto: UrCarRow[];
}

/** True for a plausible VIN: 11 to 17 characters, no I, O or Q. Case-insensitive. */
export const isVin = (v: string | null | undefined): v is string =>
  /^[A-HJ-NPR-Z0-9]{11,17}$/i.test((v ?? "").trim());

const day = (s: string | null | undefined) => (s ? s.slice(0, 10) : null);
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
const daysBetween = (a: string, b: string) =>
  (Date.parse(a + "T00:00:00Z") - Date.parse(b + "T00:00:00Z")) / 86_400_000;

export function buildVinTimeline(
  rows: VinRows,
  current?: { kind: "external" | "inauto"; id: string },
): VinEvent[] {
  const out: VinEvent[] = [];

  // Dealer: collapse the daily active snapshots per listing into one span; a sale row closes it.
  const byListing = new Map<string, DealerRow[]>();
  for (const r of rows.dealer) {
    const list = byListing.get(r.sourceListingId) ?? [];
    list.push(r);
    byListing.set(r.sourceListingId, list);
  }
  for (const list of byListing.values()) {
    const sale = list.find((r) => r.sold);
    const seen = list
      .map((r) => day(r.date))
      .filter((d): d is string => !!d)
      .sort();
    const listed = day(list.find((r) => r.listedAt)?.listedAt) ?? seen[0] ?? null;
    const last = list[list.length - 1]!;
    const where = [last.dealerName, last.state].filter(Boolean).join(", ") || "a dealer";
    if (sale) {
      const d = day(sale.date) ?? seen[seen.length - 1] ?? listed;
      if (!d) continue;
      out.push({
        date: d,
        from: listed ?? undefined,
        kind: "dealer_sold",
        title: `Sold by ${where}`,
        detail: listed ? `Listed ${listed}, left the market ${d}` : `Left the market ${d}`,
        price: sale.price,
        miles: sale.miles,
        href: null,
      });
    } else {
      const d = seen[seen.length - 1] ?? listed;
      if (!d) continue;
      out.push({
        date: d,
        from: listed ?? undefined,
        kind: "dealer_listed",
        title: `Listed by ${where}`,
        detail: listed && listed !== d ? `Seen from ${listed} to ${d}` : `Seen ${d}`,
        price: last.price,
        miles: last.miles,
        href: null,
      });
    }
  }

  // Settled auctions from the results feed. The results feed names platforms
  // ("Bring a Trailer") while live rows use keys ("bat"), so the same auction
  // is recognised by its platform listing id alone.
  const settledIds = new Set<string>();
  const settled: { platform: string; date: string }[] = [];
  for (const a of rows.auctions) {
    const d = day(a.endedAt);
    if (!d) continue;
    settledIds.add(a.sourceId);
    settled.push({ platform: norm(a.source), date: d });
    out.push({
      date: d,
      kind:
        a.status === "sold"
          ? "auction_sold"
          : a.status === "rnm"
            ? "auction_rnm"
            : "auction_withdrawn",
      title:
        a.status === "sold"
          ? `Sold at auction on ${a.source}`
          : a.status === "rnm"
            ? `Reserve not met on ${a.source}`
            : `Withdrawn from ${a.source}`,
      detail: a.status === "rnm" ? "High bid shown" : null,
      price: a.price,
      miles: a.miles,
      href: a.url,
    });
  }

  // Live and recently ended platform auctions we track ourselves.
  for (const e of rows.external) {
    if (settledIds.has(e.sourceId)) continue;
    const d = day(e.endsAt) ?? day(new Date().toISOString());
    // The results feed and the live feed number auctions differently; the same
    // platform ending within three days is the same auction.
    if (
      e.status !== "live" &&
      settled.some(
        (x) => x.platform === norm(e.sourceName) && Math.abs(daysBetween(x.date, d!)) <= 3,
      )
    )
      continue;
    const isCurrent = current?.kind === "external" && current.id === `${e.source}:${e.sourceId}`;
    const kind: EventKind =
      e.status === "live"
        ? "auction_live"
        : e.status === "sold"
          ? "auction_sold"
          : e.status === "rnm"
            ? "auction_rnm"
            : e.status === "withdrawn"
              ? "auction_withdrawn"
              : "auction_ended";
    out.push({
      date: d!,
      kind,
      title:
        kind === "auction_live"
          ? `Live on ${e.sourceName}`
          : kind === "auction_sold"
            ? `Sold at auction on ${e.sourceName}`
            : kind === "auction_rnm"
              ? `Reserve not met on ${e.sourceName}`
              : kind === "auction_withdrawn"
                ? `Withdrawn from ${e.sourceName}`
                : `Ended on ${e.sourceName}, result pending`,
      detail: kind === "auction_live" ? "Bidding open" : null,
      price: e.status === "sold" ? (e.finalPrice ?? e.currentBid) : e.currentBid,
      miles: e.miles,
      href: `/listings/ext/${e.source}/${encodeURIComponent(e.sourceId)}`,
      current: isCurrent || undefined,
    });
  }

  // UrCar listings.
  for (const l of rows.inauto) {
    if (l.status === "draft") continue;
    const isCurrent = current?.kind === "inauto" && current.id === l.id;
    const closed = l.status === "sold" || l.status === "ended" || l.status === "withdrawn";
    const d = day(closed ? (l.closedAt ?? l.createdAt) : l.createdAt)!;
    out.push({
      date: d,
      from: closed ? (day(l.createdAt) ?? undefined) : undefined,
      kind: l.status === "sold" ? "inauto_sold" : closed ? "inauto_ended" : "inauto_listed",
      title:
        l.status === "sold"
          ? "Sold on UrCar"
          : closed
            ? `${l.status === "withdrawn" ? "Withdrawn from" : "Ended on"} UrCar`
            : `Listed on UrCar (${l.type})`,
      detail: closed ? `Listed ${day(l.createdAt)}` : null,
      price: l.status === "sold" ? (l.soldPrice ?? l.askingPrice) : l.askingPrice,
      miles: l.miles,
      href: `/listings/${l.id}`,
      current: isCurrent || undefined,
    });
  }

  return out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}
