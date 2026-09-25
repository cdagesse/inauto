import Link from "next/link";
import { fmtDate } from "@/components/account/money";
import { Flash } from "@/components/admin/flash";
import { StatusPill } from "@/components/admin/status-pill";
import { createModelForm } from "@/server/admin/actions";
import { listModelsAdmin } from "@/server/admin/queries";
import { normalizeQuery } from "@/server/admin/rules";

export const dynamic = "force-dynamic";

export default async function AdminModels({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listModelsAdmin(normalizeQuery(sp.q));
  return (
    <div>
      <Flash ok={sp.ok} error={sp.error} />
      <form className="admin-search" action="/admin/models" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search make or model"
          maxLength={80}
        />
        <button className="btn sm" type="submit">
          Search
        </button>
      </form>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Make</th>
              <th>Model</th>
              <th>Report</th>
              <th>Published</th>
              <th className="n">Gens</th>
              <th className="n">Aliases</th>
              <th className="n">Dealer rows</th>
              <th className="n">Auction rows</th>
              <th>Built</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id}>
                <td>{m.makeName}</td>
                <td>
                  <Link href={`/admin/models/${m.id}`}>{m.name}</Link>{" "}
                  <Link
                    href={`/${m.makeSlug}/${m.slug}`}
                    className="hint"
                    target="_blank"
                    rel="noopener"
                  >
                    view ↗
                  </Link>
                </td>
                <td>
                  <StatusPill value={m.reportStatus} />
                </td>
                <td className="mono">{m.published ? "yes" : "no"}</td>
                <td className="n">{Number(m.generationCount)}</td>
                <td className="n">{Number(m.aliasCount)}</td>
                <td className="n">{Number(m.dealerCount).toLocaleString("en-US")}</td>
                <td className="n">{Number(m.auctionCount).toLocaleString("en-US")}</td>
                <td className="mono">{m.reportBuiltAt ? fmtDate(m.reportBuiltAt) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <section style={{ paddingTop: 28 }}>
        <h2 className="sec">Add a model</h2>
        <p className="sub">
          Creates the make if needed, the model, its source aliases, and a single “all years”
          generation you can split afterwards on the model page.
        </p>
        <form action={createModelForm} className="form">
          <div className="grid-3">
            <div className="fld">
              <label htmlFor="makeName">Make</label>
              <input
                id="makeName"
                name="makeName"
                required
                maxLength={60}
                placeholder="Mercedes-Benz"
              />
            </div>
            <div className="fld">
              <label htmlFor="name">Model</label>
              <input id="name" name="name" required maxLength={80} placeholder="S63 AMG" />
            </div>
            <div className="fld">
              <label htmlFor="shortName">Short name</label>
              <input id="shortName" name="shortName" maxLength={40} placeholder="S63" />
            </div>
            <div className="fld">
              <label htmlFor="parentLine">Parent line</label>
              <input id="parentLine" name="parentLine" maxLength={60} placeholder="Mercedes-AMG" />
            </div>
            <div className="fld">
              <label htmlFor="yearStart">First model year</label>
              <input id="yearStart" name="yearStart" type="number" min={1900} max={2100} />
            </div>
            <div className="fld">
              <label htmlFor="yearEnd">Last model year</label>
              <input id="yearEnd" name="yearEnd" type="number" min={1900} max={2100} />
            </div>
          </div>
          <div className="lab">Visor alias (dealer listings)</div>
          <div className="grid-3">
            <div className="fld">
              <label htmlFor="visorMake">Make</label>
              <input id="visorMake" name="visorMake" maxLength={60} placeholder="Mercedes-Benz" />
            </div>
            <div className="fld">
              <label htmlFor="visorModel">Model</label>
              <input id="visorModel" name="visorModel" maxLength={80} placeholder="S-Class" />
            </div>
            <div className="fld">
              <label htmlFor="visorTrim">Trim pattern (ILIKE)</label>
              <input id="visorTrim" name="visorTrim" maxLength={120} placeholder="%S63%" />
            </div>
          </div>
          <div className="lab">Old Cars Data alias (auctions)</div>
          <div className="grid-3">
            <div className="fld">
              <label htmlFor="ocdMake">Make</label>
              <input id="ocdMake" name="ocdMake" maxLength={60} placeholder="Mercedes-Benz" />
            </div>
            <div className="fld">
              <label htmlFor="ocdModel">Model</label>
              <input id="ocdModel" name="ocdModel" maxLength={80} placeholder="S63 AMG" />
            </div>
          </div>
          <div>
            <button className="btn primary" type="submit">
              Create model
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
