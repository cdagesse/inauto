import type { Metadata } from "next";
import Link from "next/link";
import { auth } from "@/auth";
import { ListingCard } from "@/components/listings/listing-card";
import { listingFilterSchema } from "@/server/listings-schema";
import { listActiveListings } from "@/server/queries/listings";

export const metadata: Metadata = {
  title: "Cars for sale",
  description:
    "Collector and enthusiast cars listed by their owners: classifieds, online auctions and private networks.",
};

export default async function ListingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const parsed = listingFilterSchema.safeParse({ type: sp.type, make: sp.make, cursor: sp.cursor });
  const filter = parsed.success ? parsed.data : {};
  const session = await auth();
  const { rows, nextCursor } = await listActiveListings(session?.user?.id ?? null, filter);
  const qs = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ type: filter.type, make: filter.make, ...patch }))
      if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/listings?${s}` : "/listings";
  };
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Buy</div>
          <h1 className="display" style={{ fontSize: 40, margin: "6px 0 0" }}>
            Cars for sale
          </h1>
          <p className="sub">
            Listed by owners, priced against real market data. Every listing can be title-vetted and
            inspected before you commit.
          </p>
        </div>
        <Link href="/sell" className="btn primary">
          Sell yours
        </Link>
      </div>
      <form className="filters" method="get" action="/listings">
        <div className="seg" role="group" aria-label="Listing type">
          <Link
            href={qs({ type: undefined, cursor: undefined })}
            className="seg-link"
            aria-pressed={!filter.type}
          >
            All
          </Link>
          <Link
            href={qs({ type: "classified", cursor: undefined })}
            className="seg-link"
            aria-pressed={filter.type === "classified"}
          >
            Classifieds
          </Link>
          <Link
            href={qs({ type: "auction", cursor: undefined })}
            className="seg-link"
            aria-pressed={filter.type === "auction"}
          >
            Auctions
          </Link>
        </div>
        {filter.type ? <input type="hidden" name="type" value={filter.type} /> : null}
        <div className="fld" style={{ flexDirection: "row", gap: 6 }}>
          <input
            name="make"
            placeholder="Make"
            defaultValue={filter.make ?? ""}
            maxLength={60}
            aria-label="Filter by make"
          />
          <button type="submit" className="btn">
            Filter
          </button>
        </div>
      </form>
      {rows.length === 0 ? (
        <p className="note" style={{ padding: "40px 0" }}>
          No active listings match. <Link href="/sell">Be the first to list.</Link>
        </p>
      ) : (
        <div className="car-grid">
          {rows.map((l) => (
            <ListingCard key={l.id} l={l} />
          ))}
        </div>
      )}
      {nextCursor ? (
        <div style={{ textAlign: "center", padding: 24 }}>
          <Link href={qs({ cursor: nextCursor })} className="btn">
            Load more
          </Link>
        </div>
      ) : null}
    </div>
  );
}
