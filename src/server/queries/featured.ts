import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { dealerActive, externalListings, featuredCars, listings, makes, models } from "@/db/schema";
import { dealerTitle } from "@/lib/listings/dealer-cursor";
import { isPlatformKey } from "@/lib/sources/platforms";
import { effectiveStatus } from "@/lib/sources/status";

export type FeaturedKind = "listing" | "external" | "dealer";

/** One card in the home hero rotation. */
export interface FeaturedCar {
  key: string;
  kind: FeaturedKind;
  href: string;
  title: string;
  sub: string;
  price: number | null;
  currency: string;
  priceLabel: string;
  photo: string | null;
  badge: string;
  endsAt: Date | null;
  featured: boolean;
  /** Set for trending cars: views in the last 7 days. */
  views?: number;
}

export async function isFeatured(kind: FeaturedKind, refId: string): Promise<boolean> {
  const [row] = await db
    .select({ id: featuredCars.id })
    .from(featuredCars)
    .where(and(eq(featuredCars.kind, kind), eq(featuredCars.refId, refId)))
    .limit(1);
  return !!row;
}

/** Admin-picked cars that are still showable (active listing / live auction), in admin order. */
export async function listFeatured(showExternalPhotos: boolean): Promise<FeaturedCar[]> {
  const picks = await db
    .select({ kind: featuredCars.kind, refId: featuredCars.refId })
    .from(featuredCars)
    .orderBy(asc(featuredCars.sortOrder), desc(featuredCars.createdAt))
    .limit(12);
  return resolveCars(picks, showExternalPhotos, true);
}

/** Loads showable cards for (kind, refId) pairs, keeping the given order. */
export async function resolveCars(
  picks: { kind: string; refId: string }[],
  showExternalPhotos: boolean,
  featured: boolean,
): Promise<FeaturedCar[]> {
  if (picks.length === 0) return [];
  const listingIds = picks.filter((p) => p.kind === "listing").map((p) => p.refId);
  const externalIds = picks.filter((p) => p.kind === "external").map((p) => p.refId);
  const dealerIds = picks.filter((p) => p.kind === "dealer").map((p) => p.refId);
  const [own, ext, dealers] = await Promise.all([
    listingIds.length
      ? db
          .select({
            id: listings.id,
            title: listings.title,
            year: listings.year,
            make: listings.make,
            model: listings.model,
            miles: listings.miles,
            photos: listings.photos,
            askingPrice: listings.askingPrice,
            type: listings.type,
            status: listings.status,
            auctionEndsAt: listings.auctionEndsAt,
          })
          .from(listings)
          .where(and(inArray(listings.id, listingIds), eq(listings.status, "active")))
      : Promise.resolve([]),
    externalIds.length
      ? db
          .select({
            id: externalListings.id,
            source: externalListings.source,
            sourceName: externalListings.sourceName,
            sourceId: externalListings.sourceId,
            title: externalListings.title,
            year: externalListings.year,
            make: externalListings.make,
            model: externalListings.model,
            miles: externalListings.miles,
            photoUrls: externalListings.photoUrls,
            currentBid: externalListings.currentBid,
            currency: externalListings.currency,
            status: externalListings.status,
            endsAt: externalListings.endsAt,
          })
          .from(externalListings)
          .where(inArray(externalListings.id, externalIds))
      : Promise.resolve([]),
    dealerIds.length
      ? db
          .select({
            id: dealerActive.id,
            year: dealerActive.year,
            make: makes.name,
            model: models.name,
            modelShort: models.shortName,
            trim: sql<string | null>`${dealerActive.rawJson}->>'trim'`,
            miles: dealerActive.miles,
            price: dealerActive.price,
            dealerName: dealerActive.dealerName,
            city: sql<string | null>`${dealerActive.rawJson}->>'city'`,
            state: dealerActive.state,
            photo: sql<
              string | null
            >`(select u from jsonb_array_elements_text(${dealerActive.rawJson}->'photo_urls') u where u like 'https://%' limit 1)`,
          })
          .from(dealerActive)
          .innerJoin(models, eq(models.id, dealerActive.modelId))
          .innerJoin(makes, eq(makes.id, models.makeId))
          .where(
            and(
              inArray(dealerActive.id, dealerIds),
              // Still in the model's newest, recent snapshot: listed now.
              sql`${dealerActive.snapshotDate} = (select max(b.snapshot_date) from dealer_active b where b.model_id = ${dealerActive.modelId})`,
              sql`${dealerActive.snapshotDate} >= current_date - 28`,
            ),
          )
      : Promise.resolve([]),
  ]);
  const byKey = new Map<string, FeaturedCar>();
  for (const d of dealers)
    byKey.set(`dealer:${d.id}`, {
      key: `dealer:${d.id}`,
      kind: "dealer",
      href: `/listings/dealer/${d.id}`,
      title: dealerTitle(d),
      sub:
        [d.dealerName, [d.city, d.state].filter(Boolean).join(", ")].filter(Boolean).join(" · ") +
        (d.miles != null ? ` · ${d.miles.toLocaleString("en-US")} mi` : ""),
      price: d.price,
      currency: "USD",
      priceLabel: "Asking",
      photo: d.photo,
      badge: d.dealerName ? `At ${d.dealerName}` : "At a dealer",
      endsAt: null,
      featured,
    });
  for (const l of own)
    byKey.set(`listing:${l.id}`, {
      key: `listing:${l.id}`,
      kind: "listing",
      href: `/listings/${l.id}`,
      title: l.title,
      sub:
        [l.year, l.make, l.model].filter(Boolean).join(" ") +
        (l.miles != null ? ` · ${l.miles.toLocaleString("en-US")} mi` : ""),
      price: l.askingPrice,
      currency: "USD",
      priceLabel: l.type === "auction" ? "Current bid" : "Asking",
      photo: l.photos[0] ?? null,
      badge: "On UrCar",
      endsAt: l.type === "auction" ? l.auctionEndsAt : null,
      featured,
    });
  for (const e of ext) {
    if (effectiveStatus(e.status, e.endsAt) !== "live") continue;
    const source = isPlatformKey(e.source) ? e.source : "other";
    byKey.set(`external:${e.id}`, {
      key: `external:${e.id}`,
      kind: "external",
      href: `/listings/ext/${source}/${encodeURIComponent(e.sourceId)}`,
      title: e.title,
      sub:
        [e.year, e.make, e.model].filter(Boolean).join(" ") +
        (e.miles != null ? ` · ${e.miles.toLocaleString("en-US")} mi` : ""),
      price: e.currentBid,
      currency: e.currency,
      priceLabel: "Current bid",
      photo: showExternalPhotos ? (e.photoUrls[0] ?? null) : null,
      badge: `Live on ${e.sourceName}`,
      endsAt: e.endsAt,
      featured,
    });
  }
  return picks.map((p) => byKey.get(`${p.kind}:${p.refId}`)).filter((c): c is FeaturedCar => !!c);
}

/** When nothing is featured: the newest active UrCar listings that have a photo. */
export async function autoFeatured(limit = 5): Promise<FeaturedCar[]> {
  const rows = await db
    .select({
      id: listings.id,
      title: listings.title,
      year: listings.year,
      make: listings.make,
      model: listings.model,
      miles: listings.miles,
      photos: listings.photos,
      askingPrice: listings.askingPrice,
      type: listings.type,
      auctionEndsAt: listings.auctionEndsAt,
    })
    .from(listings)
    .where(eq(listings.status, "active"))
    .orderBy(desc(listings.createdAt))
    .limit(limit * 3);
  return rows
    .filter((l) => l.photos.length > 0)
    .slice(0, limit)
    .map((l) => ({
      key: `listing:${l.id}`,
      kind: "listing" as const,
      href: `/listings/${l.id}`,
      title: l.title,
      sub:
        [l.year, l.make, l.model].filter(Boolean).join(" ") +
        (l.miles != null ? ` · ${l.miles.toLocaleString("en-US")} mi` : ""),
      price: l.askingPrice,
      currency: "USD",
      priceLabel: l.type === "auction" ? "Current bid" : "Asking",
      photo: l.photos[0]!,
      badge: "On UrCar",
      endsAt: l.type === "auction" ? l.auctionEndsAt : null,
      featured: false,
    }));
}

/** Admin list: every pick with what it points at, including ones no longer showable. */
export async function listFeaturedForAdmin() {
  const picks = await db
    .select({
      id: featuredCars.id,
      kind: featuredCars.kind,
      refId: featuredCars.refId,
      sortOrder: featuredCars.sortOrder,
      createdAt: featuredCars.createdAt,
    })
    .from(featuredCars)
    .orderBy(asc(featuredCars.sortOrder), desc(featuredCars.createdAt));
  const listingIds = picks.filter((p) => p.kind === "listing").map((p) => p.refId);
  const externalIds = picks.filter((p) => p.kind === "external").map((p) => p.refId);
  const [own, ext] = await Promise.all([
    listingIds.length
      ? db
          .select({ id: listings.id, title: listings.title, status: listings.status })
          .from(listings)
          .where(inArray(listings.id, listingIds))
      : Promise.resolve([]),
    externalIds.length
      ? db
          .select({
            id: externalListings.id,
            title: externalListings.title,
            status: externalListings.status,
            endsAt: externalListings.endsAt,
            source: externalListings.source,
            sourceId: externalListings.sourceId,
          })
          .from(externalListings)
          .where(inArray(externalListings.id, externalIds))
      : Promise.resolve([]),
  ]);
  return picks.map((p) => {
    if (p.kind === "listing") {
      const l = own.find((x) => x.id === p.refId);
      return {
        ...p,
        title: l?.title ?? "(listing removed)",
        status: l?.status ?? "missing",
        href: l ? `/listings/${l.id}` : null,
      };
    }
    const e = ext.find((x) => x.id === p.refId);
    const source = e && isPlatformKey(e.source) ? e.source : "other";
    return {
      ...p,
      title: e?.title ?? "(auction removed)",
      status: e ? effectiveStatus(e.status, e.endsAt) : "missing",
      href: e ? `/listings/ext/${source}/${encodeURIComponent(e.sourceId)}` : null,
    };
  });
}
