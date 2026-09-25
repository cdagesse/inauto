import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate, usd } from "@/components/account/money";
import { Flash } from "@/components/admin/flash";
import { StatusPill } from "@/components/admin/status-pill";
import {
  deleteAliasForm,
  deleteGenerationForm,
  requestModelReportForm,
  setModelPublishedForm,
  updateModelForm,
  upsertAliasForm,
  upsertGenerationForm,
} from "@/server/admin/actions";
import { getModelAdmin } from "@/server/admin/queries";

export const dynamic = "force-dynamic";

function GenerationForm({
  modelId,
  g,
}: {
  modelId: string;
  g?: {
    id: string;
    code: string;
    name: string;
    yearStart: number;
    yearEnd: number;
    originalMsrp: number | null;
    engine: string | null;
    hp: string | null;
    gearbox: string | null;
    notes: string | null;
    packages: string[];
    sortOrder: number;
  };
}) {
  const p = g ? `gen-${g.id}-` : "gen-new-";
  return (
    <form action={upsertGenerationForm} className="form">
      <input type="hidden" name="modelId" value={modelId} />
      {g ? <input type="hidden" name="id" value={g.id} /> : null}
      <div className="grid-3">
        <div className="fld">
          <label htmlFor={`${p}code`}>Code</label>
          <input
            id={`${p}code`}
            name="code"
            required
            maxLength={24}
            defaultValue={g?.code ?? ""}
            placeholder="992"
          />
        </div>
        <div className="fld">
          <label htmlFor={`${p}name`}>Name</label>
          <input id={`${p}name`} name="name" required maxLength={60} defaultValue={g?.name ?? ""} />
        </div>
        <div className="fld">
          <label htmlFor={`${p}sortOrder`}>Sort order</label>
          <input
            id={`${p}sortOrder`}
            name="sortOrder"
            type="number"
            min={0}
            max={1000}
            defaultValue={g?.sortOrder ?? 0}
          />
        </div>
        <div className="fld">
          <label htmlFor={`${p}yearStart`}>Year start</label>
          <input
            id={`${p}yearStart`}
            name="yearStart"
            type="number"
            required
            min={1900}
            max={2100}
            defaultValue={g?.yearStart ?? ""}
          />
        </div>
        <div className="fld">
          <label htmlFor={`${p}yearEnd`}>Year end</label>
          <input
            id={`${p}yearEnd`}
            name="yearEnd"
            type="number"
            required
            min={1900}
            max={2100}
            defaultValue={g?.yearEnd ?? ""}
          />
        </div>
        <div className="fld">
          <label htmlFor={`${p}originalMsrp`}>Original MSRP</label>
          <input
            id={`${p}originalMsrp`}
            name="originalMsrp"
            inputMode="numeric"
            defaultValue={g?.originalMsrp ?? ""}
          />
        </div>
        <div className="fld">
          <label htmlFor={`${p}engine`}>Engine</label>
          <input id={`${p}engine`} name="engine" maxLength={80} defaultValue={g?.engine ?? ""} />
        </div>
        <div className="fld">
          <label htmlFor={`${p}hp`}>Output</label>
          <input id={`${p}hp`} name="hp" maxLength={40} defaultValue={g?.hp ?? ""} />
        </div>
        <div className="fld">
          <label htmlFor={`${p}gearbox`}>Gearbox</label>
          <input id={`${p}gearbox`} name="gearbox" maxLength={80} defaultValue={g?.gearbox ?? ""} />
        </div>
        <div className="fld">
          <label htmlFor={`${p}packages`}>Packages (comma separated)</label>
          <input
            id={`${p}packages`}
            name="packages"
            maxLength={200}
            defaultValue={g?.packages.join(", ") ?? ""}
            placeholder="weissach"
          />
        </div>
        <div className="fld" style={{ gridColumn: "span 2" }}>
          <label htmlFor={`${p}notes`}>
            Notes (use match:&lt;regex&gt; to disambiguate shared years)
          </label>
          <input id={`${p}notes`} name="notes" maxLength={500} defaultValue={g?.notes ?? ""} />
        </div>
      </div>
      <div className="admin-actions">
        <button className="btn sm primary" type="submit">
          {g ? "Save generation" : "Add generation"}
        </button>
      </div>
    </form>
  );
}

export default async function AdminModelPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [{ id }, sp] = await Promise.all([params, searchParams]);
  const d = await getModelAdmin(id);
  if (!d) notFound();
  const { model, make } = d;
  return (
    <div>
      <Link href="/admin/models" className="mono" style={{ color: "var(--ink-3)" }}>
        ← Models
      </Link>
      <div className="page-head" style={{ paddingTop: 12 }}>
        <div>
          <h2 className="display" style={{ fontSize: 28, margin: 0 }}>
            {make.name} {model.name}
          </h2>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            <StatusPill value={model.reportStatus} /> ·{" "}
            {model.published ? "published" : "unpublished"} ·{" "}
            <Link href={`/${make.slug}/${model.slug}`} target="_blank" rel="noopener">
              /{make.slug}/{model.slug} ↗
            </Link>
            {model.reportBuiltAt ? <> · built {fmtDate(model.reportBuiltAt)}</> : null}
            {model.reportError ? <span className="err"> · {model.reportError}</span> : null}
          </p>
        </div>
        <div className="admin-actions">
          <form action={requestModelReportForm}>
            <input type="hidden" name="id" value={model.id} />
            <button className="btn sm" type="submit">
              Request report rebuild
            </button>
          </form>
          <form action={setModelPublishedForm}>
            <input type="hidden" name="id" value={model.id} />
            <input type="hidden" name="published" value={model.published ? "false" : "true"} />
            <button className={`btn sm ${model.published ? "" : "primary"}`} type="submit">
              {model.published ? "Unpublish" : "Publish"}
            </button>
          </form>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <section className="panel" style={{ marginTop: 12 }}>
        <div className="lab">Model</div>
        <form action={updateModelForm} className="admin-form">
          <input type="hidden" name="id" value={model.id} />
          <div className="grid-3">
            <div className="fld">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" required maxLength={80} defaultValue={model.name} />
            </div>
            <div className="fld">
              <label htmlFor="shortName">Short name</label>
              <input
                id="shortName"
                name="shortName"
                maxLength={40}
                defaultValue={model.shortName ?? ""}
              />
            </div>
            <div className="fld">
              <label htmlFor="parentLine">Parent line</label>
              <input
                id="parentLine"
                name="parentLine"
                maxLength={60}
                defaultValue={model.parentLine ?? ""}
              />
            </div>
            <div className="fld">
              <label htmlFor="yearStart">First model year</label>
              <input
                id="yearStart"
                name="yearStart"
                type="number"
                min={1900}
                max={2100}
                defaultValue={model.yearStart ?? ""}
              />
            </div>
            <div className="fld">
              <label htmlFor="yearEnd">Last model year</label>
              <input
                id="yearEnd"
                name="yearEnd"
                type="number"
                min={1900}
                max={2100}
                defaultValue={model.yearEnd ?? ""}
              />
            </div>
          </div>
          <div className="admin-actions">
            <button className="btn sm primary" type="submit">
              Save model
            </button>
          </div>
        </form>
      </section>

      <section style={{ paddingTop: 28 }}>
        <h3 className="sec">Generations · {d.generations.length}</h3>
        <p className="sub">
          Rows are assigned to a generation by model year. Delete is allowed only when nothing
          references it.
        </p>
        {d.generations.map(({ g, dealerCount, auctionCount }) => (
          <div key={g.id} className="admin-block">
            <div className="admin-block-head">
              <b className="display" style={{ fontSize: 18 }}>
                {g.code}
              </b>
              <span className="hint">
                {g.name} · {g.yearStart}–{g.yearEnd}
                {g.originalMsrp ? ` · MSRP ${usd(g.originalMsrp)}` : ""} · {Number(dealerCount)}{" "}
                dealer / {Number(auctionCount)} auction rows
              </span>
              <form action={deleteGenerationForm} style={{ marginLeft: "auto" }}>
                <input type="hidden" name="modelId" value={model.id} />
                <input type="hidden" name="id" value={g.id} />
                <button
                  className="btn sm danger"
                  type="submit"
                  disabled={Number(dealerCount) + Number(auctionCount) > 0}
                >
                  Delete
                </button>
              </form>
            </div>
            <GenerationForm modelId={model.id} g={g} />
          </div>
        ))}
        <div className="admin-block">
          <div className="lab">New generation</div>
          <GenerationForm modelId={model.id} />
        </div>
      </section>

      <section style={{ paddingTop: 28 }}>
        <h3 className="sec">Source aliases · {d.aliases.length}</h3>
        <p className="sub">
          How each data source spells this model. The nightly job pulls only models with at least
          one alias.
        </p>
        {d.aliases.map((a) => (
          <form key={a.id} action={upsertAliasForm} className="form admin-inline">
            <input type="hidden" name="modelId" value={model.id} />
            <input type="hidden" name="id" value={a.id} />
            <div className="fld">
              <label htmlFor={`al-${a.id}-source`}>Source</label>
              <select id={`al-${a.id}-source`} name="source" defaultValue={a.source}>
                <option value="visor">visor</option>
                <option value="ocd">ocd</option>
              </select>
            </div>
            <div className="fld">
              <label htmlFor={`al-${a.id}-make`}>Make</label>
              <input
                id={`al-${a.id}-make`}
                name="rawMake"
                required
                maxLength={60}
                defaultValue={a.rawMake}
              />
            </div>
            <div className="fld">
              <label htmlFor={`al-${a.id}-model`}>Model</label>
              <input
                id={`al-${a.id}-model`}
                name="rawModel"
                required
                maxLength={80}
                defaultValue={a.rawModel}
              />
            </div>
            <div className="fld">
              <label htmlFor={`al-${a.id}-trim`}>Trim pattern</label>
              <input
                id={`al-${a.id}-trim`}
                name="rawTrimPattern"
                maxLength={120}
                defaultValue={a.rawTrimPattern ?? ""}
              />
            </div>
            <div className="admin-actions">
              <button className="btn sm" type="submit">
                Save
              </button>
              <button className="btn sm danger" formAction={deleteAliasForm} type="submit">
                Delete
              </button>
            </div>
          </form>
        ))}
        <form action={upsertAliasForm} className="form admin-inline">
          <input type="hidden" name="modelId" value={model.id} />
          <div className="fld">
            <label htmlFor="al-new-source">Source</label>
            <select id="al-new-source" name="source" defaultValue="visor">
              <option value="visor">visor</option>
              <option value="ocd">ocd</option>
            </select>
          </div>
          <div className="fld">
            <label htmlFor="al-new-make">Make</label>
            <input id="al-new-make" name="rawMake" required maxLength={60} />
          </div>
          <div className="fld">
            <label htmlFor="al-new-model">Model</label>
            <input id="al-new-model" name="rawModel" required maxLength={80} />
          </div>
          <div className="fld">
            <label htmlFor="al-new-trim">Trim pattern</label>
            <input id="al-new-trim" name="rawTrimPattern" maxLength={120} placeholder="%GT3 RS%" />
          </div>
          <div className="admin-actions">
            <button className="btn sm primary" type="submit">
              Add alias
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
