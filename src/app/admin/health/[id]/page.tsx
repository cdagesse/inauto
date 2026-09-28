import Link from "next/link";
import { notFound } from "next/navigation";
import { fmtDate } from "@/lib/format/money";
import { baseName, jobSpec, summaryList, summaryObject } from "@/lib/jobs/health";
import { getRun } from "@/server/admin/health";

export const dynamic = "force-dynamic";

const num = (v: unknown) => (typeof v === "number" ? v.toLocaleString("en-US") : "");
const text = (v: unknown) => (typeof v === "string" ? v : "");
/** Already shown in the run header. */
const HEADER_KEYS = new Set(["jobRunId", "dryRun", "startedAt", "finishedAt"]);

/** Top-level numbers, strings and booleans of a summary, in a definition list. */
function KeyValues({ data }: { data: Record<string, unknown> }) {
  const entries = Object.entries(data).filter(
    ([k, v]) =>
      !HEADER_KEYS.has(k) &&
      (typeof v === "number" || typeof v === "string" || typeof v === "boolean" || v === null),
  );
  if (!entries.length) return null;
  return (
    <dl className="kv">
      {entries.map(([k, v]) => (
        <div key={k}>
          <dt className="mono">{k}</dt>
          <dd className="mono">{v === null ? "—" : String(v)}</dd>
        </div>
      ))}
    </dl>
  );
}

function ModelsTable({ models }: { models: Record<string, unknown>[] }) {
  return (
    <div className="tw">
      <table>
        <thead>
          <tr>
            <th>Model</th>
            <th className="n">Visor sold</th>
            <th className="n">Visor active</th>
            <th className="n">OCD auctions</th>
            <th className="n">Unmatched</th>
            <th className="n">To review</th>
            <th className="n">Excluded</th>
            <th className="n">Warnings</th>
            <th>Errors</th>
          </tr>
        </thead>
        <tbody>
          {models.map((m, i) => {
            const excluded = Object.values(summaryObject(m.excluded)).reduce<number>(
              (a, v) => a + (typeof v === "number" ? v : 0),
              0,
            );
            const errors = summaryList(m, "errors").map(String);
            const stopped = summaryList(m, "budgetStopped").map(String);
            return (
              <tr key={`${text(m.model)}-${i}`}>
                <td className="mono">{text(m.model)}</td>
                <td className="n mono">{num(m.visorSold)}</td>
                <td className="n mono">{num(m.visorActive)}</td>
                <td className="n mono">{num(m.ocdAuctions)}</td>
                <td className="n mono">{num(m.unmatchedRows)}</td>
                <td className="n mono">{num(m.needsReview)}</td>
                <td className="n mono">{excluded.toLocaleString("en-US")}</td>
                <td className="n mono">{summaryList(m, "warnings").length}</td>
                <td className="health-line">
                  {[...stopped.map((s) => `budget stopped: ${s}`), ...errors].join("; ")}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default async function AdminRun({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const run = await getRun(id);
  if (!run) notFound();
  const spec = jobSpec(run.name);
  const base = baseName(run.name);
  const s = summaryObject(run.summary);
  const errors = summaryList(s, "errors").map(String);
  if (run.error && !errors.includes(run.error)) errors.unshift(run.error);
  const models = summaryList(s, "models").map(summaryObject);
  const processed = summaryList(s, "processed").map(summaryObject);
  const ids = summaryList(s, "ids").map(summaryObject);
  const failed = summaryList(s, "failed").map(String);

  return (
    <div>
      <p className="sub" style={{ marginTop: 4 }}>
        <Link href="/admin/health">Health</Link> ·{" "}
        <Link href={`/admin/health?job=${spec.name}&all=1`}>{spec.label} history</Link>
      </p>
      <div className="panel health-card">
        <div className="head">
          <div className="lab">
            {spec.label} <span className="mono">({run.name})</span>
          </div>
          <span>
            {!run.finishedAt ? (
              <span className="pill accent">open</span>
            ) : run.ok === false ? (
              <span className="pill down">failed</span>
            ) : (
              <span className="pill up">ok</span>
            )}
            {run.dryRun ? <span className="pill"> dry run</span> : null}
          </span>
        </div>
        <div className="detail">{run.headline}</div>
        <div className="hint mono">
          Started {fmtDate(run.startedAt)}
          {run.finishedAt ? ` · finished ${fmtDate(run.finishedAt)}` : " · not finished"}
          {run.duration ? ` · took ${run.duration}` : ""}
          {run.changed != null ? ` · ${run.changed.toLocaleString("en-US")} changed` : ""}
        </div>
      </div>

      {errors.length ? (
        <section style={{ paddingTop: 20 }}>
          <h2 className="sec">Errors</h2>
          <ul className="health-errors">
            {errors.map((e, i) => (
              <li key={i} className="mono">
                {e}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {models.length ? (
        <section style={{ paddingTop: 20 }}>
          <h2 className="sec">Models</h2>
          <ModelsTable models={models} />
        </section>
      ) : null}

      {(base === "reports" || base === "title-vetting") && processed.length ? (
        <section style={{ paddingTop: 20 }}>
          <h2 className="sec">Processed</h2>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>{base === "reports" ? "Model" : "Order"}</th>
                  <th>{base === "reports" ? "Status" : "Step"}</th>
                  <th>{base === "reports" ? "Error" : "Verdict"}</th>
                </tr>
              </thead>
              <tbody>
                {processed.map((p, i) => (
                  <tr key={i}>
                    <td className="mono">
                      {base === "reports" ? text(p.model) : text(p.id).slice(0, 8)}
                    </td>
                    <td className="mono">{base === "reports" ? text(p.status) : text(p.step)}</td>
                    <td className="health-line">
                      {base === "reports" ? text(p.error) : text(p.verdict)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {base === "close-auctions" && ids.length ? (
        <section style={{ paddingTop: 20 }}>
          <h2 className="sec">Auctions closed</h2>
          <ul className="health-errors">
            {ids.map((r, i) => (
              <li key={i} className="mono">
                <Link href={`/listings/${text(r.id)}`}>{text(r.id).slice(0, 8)}</Link>{" "}
                {text(r.outcome)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {base === "snapshots" && failed.length ? (
        <section style={{ paddingTop: 20 }}>
          <h2 className="sec">Reports that failed to build</h2>
          <ul className="health-errors">
            {failed.map((f, i) => (
              <li key={i} className="mono">
                {f}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section style={{ paddingTop: 20 }}>
        <h2 className="sec">Counts</h2>
        <KeyValues data={s} />
        {Object.keys(summaryObject(s.pruned)).length ? (
          <>
            <h3 className="sec" style={{ fontSize: 15, marginTop: 14 }}>
              Retention
            </h3>
            <KeyValues data={summaryObject(s.pruned)} />
          </>
        ) : null}
      </section>

      <section style={{ paddingTop: 20 }}>
        <details>
          <summary className="sec" style={{ cursor: "pointer" }}>
            Raw summary
          </summary>
          <pre className="run-json">{JSON.stringify(run.summary ?? null, null, 2)}</pre>
        </details>
      </section>
    </div>
  );
}
