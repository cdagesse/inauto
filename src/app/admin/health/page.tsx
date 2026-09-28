import Link from "next/link";
import { Pager } from "@/components/admin/pager";
import { fmtDate } from "@/lib/format/money";
import { JOBS, needsAttention, statusLabel, statusTone, type JobStatus } from "@/lib/jobs/health";
import {
  dataFreshness,
  jobHealth,
  listRuns,
  sourceHealth,
  type RunStatusFilter,
} from "@/server/admin/health";
import { parsePage } from "@/server/admin/rules";

export const dynamic = "force-dynamic";

const STATUSES: RunStatusFilter[] = ["ok", "failed", "open"];
const num = (v: number) => v.toLocaleString("en-US");

function JobPill({ status }: { status: JobStatus }) {
  return <span className={`pill ${statusTone(status)}`}>{statusLabel(status)}</span>;
}

/** Result of one run row. */
export function RunPill({ ok, finishedAt }: { ok: boolean | null; finishedAt: Date | null }) {
  if (!finishedAt) return <span className="pill accent">open</span>;
  if (ok === false) return <span className="pill down">failed</span>;
  return <span className="pill up">ok</span>;
}

function Flag({ on, label }: { on: boolean; label: string }) {
  return (
    <span className={`pill ${on ? "up" : ""}`} title={on ? "configured" : "not configured"}>
      {label}
    </span>
  );
}

export default async function AdminHealth({
  searchParams,
}: {
  searchParams: Promise<{ job?: string; status?: string; all?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const job = JOBS.some((j) => j.name === sp.job) ? sp.job : undefined;
  const status = STATUSES.find((s) => s === sp.status);
  const all = sp.all === "1";
  const page = parsePage(sp.page);
  const now = new Date();
  const [jobs, sources, data, runs] = await Promise.all([
    jobHealth(now),
    sourceHealth(now),
    dataFreshness(now),
    listRuns({ job, status, all, page }),
  ]);
  const attention = jobs.filter((j) => needsAttention(j.assessment.status));
  const qs = new URLSearchParams();
  if (job) qs.set("job", job);
  if (status) qs.set("status", status);
  if (all) qs.set("all", "1");
  const base = `/admin/health${qs.size ? `?${qs}` : ""}`;

  return (
    <div>
      <p className="sub" style={{ marginTop: 4 }}>
        {attention.length === 0
          ? `Every job is healthy as of ${fmtDate(now)}.`
          : `${attention.length === 1 ? "One job needs" : `${attention.length} jobs need`} attention: ${attention
              .map((j) => j.spec.label)
              .join(", ")}.`}
      </p>
      {sources.config.dryRun ? (
        <div className="panel health-warn" role="status">
          Jobs are in dry-run mode: every run pulls data but writes nothing. Set JOBS_DRY_RUN to
          &quot;false&quot; in Vercel to go live.
        </div>
      ) : null}

      <section>
        <h2 className="sec">Jobs</h2>
        <div className="health-grid">
          {jobs.map((j) => (
            <div key={j.spec.name} className="panel health-card">
              <div className="head">
                <div className="lab">{j.spec.label}</div>
                <JobPill status={j.assessment.status} />
              </div>
              <div className="what">{j.spec.what}</div>
              <div className="detail">{j.assessment.detail}</div>
              {j.last ? (
                <div className="hint">
                  Last run: {j.last.headline}
                  {j.last.dryRun ? " (dry run)" : ""}
                  {j.last.duration ? ` · took ${j.last.duration}` : ""}
                </div>
              ) : null}
              <div className="hint mono">
                {j.spec.schedule} · 7 d: {num(j.week.runs)} runs, {num(j.week.failed)} failed
                {j.week.changed ? `, ${num(j.week.changed)} changed` : ""}
              </div>
              <div className="links">
                <Link href={`/admin/health?job=${j.spec.name}&all=1`}>History</Link>
                {j.last ? <Link href={`/admin/health/${j.last.id}`}>Last run</Link> : null}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section style={{ paddingTop: 28 }}>
        <h2 className="sec">Data sources</h2>
        <p className="sub">
          API budget for {sources.month} and the calls recorded in the last day and week.
        </p>
        <div className="health-grid">
          {sources.sources.map((s) => {
            const pct = s.cap > 0 ? Math.min(100, Math.round((s.used / s.cap) * 100)) : 0;
            return (
              <div key={s.source} className="panel health-card">
                <div className="head">
                  <div className="lab">{s.label}</div>
                  <span className={`pill ${s.configured ? "up" : "down"}`}>
                    {s.configured ? "key set" : "no key"}
                  </span>
                </div>
                <div className="detail">
                  {num(s.used)} of {num(s.cap)} calls used this month ({pct}%)
                </div>
                <div
                  className={`budget-bar${pct >= 90 ? " hot" : ""}`}
                  role="progressbar"
                  aria-valuenow={pct}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-label={`${s.label} monthly budget used`}
                >
                  <i style={{ width: `${pct}%` }} />
                </div>
                <div className="hint">
                  24 h: {num(s.calls24)} calls, {num(s.errors24)} errors · 7 d: {num(s.calls7)}{" "}
                  calls, {num(s.errors7)} errors, {num(s.rows7)} rows
                </div>
                <div className="hint mono">
                  Last call {s.last ? fmtDate(s.last) : "never"} · last success{" "}
                  {s.lastOk ? fmtDate(s.lastOk) : "none this week"}
                </div>
              </div>
            );
          })}
          <div className="panel health-card">
            <div className="head">
              <div className="lab">Configuration</div>
              <span className={`pill ${sources.config.dryRun ? "down" : "up"}`}>
                {sources.config.dryRun ? "dry run" : "live"}
              </span>
            </div>
            <div className="what">Secrets present on this deployment.</div>
            <div className="flags">
              <Flag on={sources.config.cron} label="cron secret" />
              <Flag on={sources.config.blob} label="uploads" />
              <Flag on={sources.config.vitu} label="vitu nmvtis" />
              <Flag on={sources.config.mvr} label="vitu mvr" />
              <Flag on={sources.config.assistant} label="assistant" />
            </div>
          </div>
        </div>
        {sources.failures.length ? (
          <div className="tw" style={{ marginTop: 14 }}>
            <table>
              <thead>
                <tr>
                  <th>Recent source errors</th>
                  <th>Endpoint</th>
                  <th className="n">HTTP</th>
                  <th>When</th>
                </tr>
              </thead>
              <tbody>
                {sources.failures.map((f) => (
                  <tr key={f.id}>
                    <td className="mono">{f.source}</td>
                    <td className="mono">{f.endpoint}</td>
                    <td className="n mono">{f.status}</td>
                    <td className="mono">{fmtDate(f.at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section style={{ paddingTop: 28 }}>
        <h2 className="sec">Data on hand</h2>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Dataset</th>
                <th className="n">Rows</th>
                <th className="n">Last 24 h</th>
                <th>Newest</th>
              </tr>
            </thead>
            <tbody>
              {data.map((d) => (
                <tr key={d.label}>
                  <td>
                    {d.label}
                    <div className="hint">{d.what}</div>
                  </td>
                  <td className="n mono">{num(d.total)}</td>
                  <td className="n mono">{d.day == null ? "" : num(d.day)}</td>
                  <td className="mono">{d.newest ? fmtDate(d.newest) : (d.newestDay ?? "")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ paddingTop: 28 }}>
        <h2 className="sec">Run history</h2>
        <p className="sub">
          Every recorded run, newest first. Runs that found nothing to do are hidden unless you tick
          the box.
        </p>
        <form className="admin-search" action="/admin/health" method="get">
          <select name="job" defaultValue={job ?? ""} aria-label="Job">
            <option value="">All jobs</option>
            {JOBS.map((j) => (
              <option key={j.name} value={j.name}>
                {j.label}
              </option>
            ))}
          </select>
          <select name="status" defaultValue={status ?? ""} aria-label="Result">
            <option value="">Any result</option>
            <option value="ok">Succeeded</option>
            <option value="failed">Failed</option>
            <option value="open">Still open</option>
          </select>
          <label className="health-check">
            <input type="checkbox" name="all" value="1" defaultChecked={all} /> Show runs that
            changed nothing
          </label>
          <button className="btn sm" type="submit">
            Filter
          </button>
        </form>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>Started</th>
                <th>Job</th>
                <th>Result</th>
                <th>Took</th>
                <th className="n">Changed</th>
                <th>What happened</th>
              </tr>
            </thead>
            <tbody>
              {runs.rows.length === 0 ? (
                <tr>
                  <td colSpan={6} className="note">
                    No runs match.
                  </td>
                </tr>
              ) : (
                runs.rows.map((r) => (
                  <tr key={r.id}>
                    <td className="mono">
                      <Link href={`/admin/health/${r.id}`}>{fmtDate(r.startedAt)}</Link>
                    </td>
                    <td className="mono">{r.name}</td>
                    <td>
                      <RunPill ok={r.ok} finishedAt={r.finishedAt} />
                      {r.dryRun ? <span className="pill"> dry run</span> : null}
                    </td>
                    <td className="mono">{r.duration ?? ""}</td>
                    <td className="n mono">{r.changed == null ? "" : num(r.changed)}</td>
                    <td className="health-line">{r.headline}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pager page={page} total={runs.total} href={base} />
      </section>
    </div>
  );
}
