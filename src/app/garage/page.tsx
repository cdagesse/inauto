import type { Metadata } from "next";
import Link from "next/link";
import { requireSignedIn } from "@/components/account/require-signin";
import { fmtDate, mi, usd } from "@/components/account/money";
import { GarageCarForm } from "@/components/garage/car-form";
import { listMarketModels } from "@/lib/market/source";
import { deleteGarageCarForm, moveGarageCarForm } from "@/server/forms";
import { listGarage } from "@/server/queries/garage";
import { listMyListings } from "@/server/queries/listings";
import { slugify } from "@/server/result";

export const metadata: Metadata = { title: "My garage" };

const SHELVES = [
  {
    key: "wishlist",
    title: "Wish list",
    blurb: "Cars you want. We will alert you to listings and price moves.",
  },
  {
    key: "owned",
    title: "Currently own",
    blurb: "Track what each car is worth against live market data.",
  },
  {
    key: "previous",
    title: "Previously owned",
    blurb: "Your history, and what you made or lost on each one.",
  },
] as const;

export default async function GaragePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const user = await requireSignedIn("/garage");
  const [cars, markets, mine] = await Promise.all([
    listGarage(user.id),
    listMarketModels(),
    listMyListings(user.id),
  ]);
  const marketIndex = new Map(
    markets.flatMap((m) => {
      const key = `${m.make.slug}/${m.model.slug}`;
      const alt = `${m.make.slug}/${m.model.slug.replace(/^911-/, "")}`;
      return [
        [key, m],
        [alt, m],
      ] as const;
    }),
  );
  const marketFor = (make: string, model: string) =>
    marketIndex.get(`${slugify(make)}/${slugify(model)}`) ?? null;

  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Virtual garage</div>
          <h1 className="display" style={{ fontSize: 40, margin: "6px 0 0" }}>
            {user.name ? `${user.name.split(" ")[0]}'s garage` : "My garage"}
          </h1>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          <Link href="/sell" className="btn primary">
            List a car
          </Link>
          <a href="#add-car" className="btn">
            Add a car
          </a>
        </div>
      </div>

      {error ? <p className="err">{error}</p> : null}

      {SHELVES.map((shelf) => {
        const rows = cars.filter((c) => c.status === shelf.key);
        return (
          <section key={shelf.key} className="shelf">
            <h2 className="sec">
              {shelf.title} <span className="count">{rows.length}</span>
            </h2>
            <p className="sub">{shelf.blurb}</p>
            {rows.length === 0 ? (
              <p className="note">Nothing here yet.</p>
            ) : (
              <div className="car-grid">
                {rows.map((c) => {
                  const market = marketFor(c.make, c.model);
                  return (
                    <article key={c.id} className="panel car-card">
                      <div className="lab">{c.nickname ?? shelf.title}</div>
                      <h3 className="display" style={{ fontSize: 20, margin: "2px 0 4px" }}>
                        {c.year ? `${c.year} ` : ""}
                        {c.make} {c.model}
                        {c.trim ? <span style={{ color: "var(--ink-3)" }}> {c.trim}</span> : null}
                      </h3>
                      <dl className="kv">
                        {c.miles != null ? (
                          <>
                            <dt>Miles</dt>
                            <dd className="num">{mi(c.miles)}</dd>
                          </>
                        ) : null}
                        {c.color ? (
                          <>
                            <dt>Color</dt>
                            <dd>{c.color}</dd>
                          </>
                        ) : null}
                        {c.purchasePrice != null ? (
                          <>
                            <dt>Paid</dt>
                            <dd className="num">
                              {usd(c.purchasePrice)}
                              {c.acquiredAt ? (
                                <span className="hint"> · {fmtDate(c.acquiredAt)}</span>
                              ) : null}
                            </dd>
                          </>
                        ) : null}
                        {c.salePrice != null ? (
                          <>
                            <dt>Sold for</dt>
                            <dd className="num">
                              {usd(c.salePrice)}
                              {c.purchasePrice != null ? (
                                <span
                                  className={`chg ${c.salePrice >= c.purchasePrice ? "up" : "down"}`}
                                >
                                  {" "}
                                  {c.salePrice >= c.purchasePrice ? "+" : "−"}
                                  {usd(Math.abs(c.salePrice - c.purchasePrice))}
                                </span>
                              ) : null}
                            </dd>
                          </>
                        ) : null}
                        {c.vin ? (
                          <>
                            <dt>VIN</dt>
                            <dd className="mono">{c.vin}</dd>
                          </>
                        ) : null}
                      </dl>
                      {market ? (
                        <p className="market-line">
                          Market: median <b className="num">{usd(market.headline)}</b> ·{" "}
                          <Link href={`/${market.make.slug}/${market.model.slug}`}>
                            view report
                          </Link>
                        </p>
                      ) : (
                        <p className="note">No market report for this model yet.</p>
                      )}
                      {c.notes ? <p className="note">{c.notes}</p> : null}
                      <div className="card-actions">
                        {shelf.key === "wishlist" ? (
                          <span className="pill" aria-disabled="true">
                            Get alerts (soon)
                          </span>
                        ) : null}
                        {SHELVES.filter((s) => s.key !== shelf.key).map((s) => (
                          <form key={s.key} action={moveGarageCarForm}>
                            <input type="hidden" name="id" value={c.id} />
                            <input type="hidden" name="status" value={s.key} />
                            <button type="submit" className="btn sm">
                              Move to {s.title.toLowerCase()}
                            </button>
                          </form>
                        ))}
                        <form action={deleteGarageCarForm}>
                          <input type="hidden" name="id" value={c.id} />
                          <button type="submit" className="btn sm danger">
                            Remove
                          </button>
                        </form>
                      </div>
                    </article>
                  );
                })}
              </div>
            )}
          </section>
        );
      })}

      <section className="shelf">
        <h2 className="sec">
          My listings <span className="count">{mine.length}</span>
        </h2>
        <p className="sub">Cars you have listed for sale on InAuto.</p>
        {mine.length === 0 ? (
          <p className="note">
            No listings yet. <Link href="/sell">List a car</Link> to get pricing guidance and reach
            buyers.
          </p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Listing</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="n">Price</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {mine.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/listings/${l.id}`}>{l.title}</Link>
                    </td>
                    <td>{l.type}</td>
                    <td>
                      <span className={`pill ${l.status === "active" ? "up" : ""}`}>
                        {l.status}
                      </span>
                    </td>
                    <td className="n">
                      {l.type === "auction"
                        ? l.reservePrice
                          ? `reserve ${usd(l.reservePrice)}`
                          : "no reserve"
                        : usd(l.askingPrice)}
                    </td>
                    <td className="mono">{fmtDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="shelf">
        <GarageCarForm />
      </section>
    </div>
  );
}
