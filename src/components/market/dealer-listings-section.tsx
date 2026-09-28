import Link from "next/link";
import { DealerCard } from "@/components/listings/dealer-card";
import { listDealerListingsForModel } from "@/server/queries/dealers";

/**
 * "For sale at dealers" on a model's report page: the freshest dealer listings we hold
 * for the model, with a link to the Buy page filtered to it. Renders nothing when the
 * model has no dealer inventory yet.
 */
export async function DealerListingsSection({
  makeSlug,
  modelSlug,
  makeName,
  modelName,
}: {
  makeSlug: string;
  modelSlug: string;
  makeName: string;
  modelName: string;
}) {
  let data: Awaited<ReturnType<typeof listDealerListingsForModel>>;
  try {
    data = await listDealerListingsForModel(makeSlug, modelSlug, 8);
  } catch (e) {
    console.error("[dealer listings] section failed", e);
    return null;
  }
  if (data.total === 0) return null;
  const more = `/listings?source=dealer&make=${encodeURIComponent(makeName)}&model=${encodeURIComponent(modelName)}`;
  return (
    <section className="shelf dealer-shelf" aria-labelledby="dealers-h">
      <div className="feed-head">
        <h2 id="dealers-h" className="sec">
          For sale at dealers
        </h2>
        <p className="hint feed-hint">
          {data.total.toLocaleString("en-US")} listed at dealers now, asking prices from Visor.
          Freshest first.
        </p>
      </div>
      <div className="car-grid">
        {data.rows.map((l) => (
          <DealerCard key={l.id} l={l} />
        ))}
      </div>
      {data.total > data.rows.length ? (
        <p style={{ marginTop: 12 }}>
          <Link href={more} className="btn">
            See all {data.total.toLocaleString("en-US")} dealer listings
          </Link>
        </p>
      ) : null}
    </section>
  );
}
