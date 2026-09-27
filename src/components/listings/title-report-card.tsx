import type { TitleSummary } from "@/lib/sources/vitu";
import type { MvrSummary } from "@/lib/sources/vitu-mvr";

/** The result of a title check, for the buyer who ordered it and the listing owner. */
export function MvrReportSection({ mvr }: { mvr: MvrSummary }) {
  const tone = mvr.verdict === "verified" ? "up" : mvr.verdict === "issues" ? "down" : "";
  return (
    <div className="mvr-section">
      <div className="lab">Registration record · state DMV via Vitu</div>
      <div className="title-verdict">
        <span className={`pill ${tone}`}>
          {mvr.verdict === "verified"
            ? "Owner and registration verified"
            : mvr.verdict === "issues"
              ? "Check these"
              : mvr.verdict === "pending"
                ? "Waiting for the state"
                : "Inconclusive"}
        </span>
      </div>
      {mvr.flags.length ? (
        <ul className="title-flags">
          {mvr.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <dl className="kv">
        <dt>Registered owner</dt>
        <dd>
          {mvr.owner ?? "Not returned"}
          {mvr.coOwner ? ` and ${mvr.coOwner}` : ""}
          {mvr.ownerMatch === "match"
            ? " · matches seller"
            : mvr.ownerMatch === "partial"
              ? " · partly matches seller"
              : mvr.ownerMatch === "mismatch"
                ? " · does not match seller"
                : ""}
        </dd>
        <dt>Lienholder</dt>
        <dd>{mvr.lienholder ?? "None on record"}</dd>
        {mvr.lessor ? (
          <>
            <dt>Lessor</dt>
            <dd>{mvr.lessor}</dd>
          </>
        ) : null}
        <dt>Registration</dt>
        <dd>
          {mvr.registrationState ?? mvr.state}
          {mvr.registrationExpires ? ` · expires ${mvr.registrationExpires}` : ""}
        </dd>
        {mvr.titleState || mvr.titleNumber ? (
          <>
            <dt>Title</dt>
            <dd>{[mvr.titleState, mvr.titleNumber].filter(Boolean).join(" · ")}</dd>
          </>
        ) : null}
      </dl>
    </div>
  );
}

export function TitleReportCard({
  summary,
  mvr,
  when,
}: {
  summary: TitleSummary | null;
  mvr?: MvrSummary | null;
  when: string;
}) {
  if (!summary && mvr)
    return (
      <div className="panel title-report">
        <MvrReportSection mvr={mvr} />
        <p className="hint" style={{ marginTop: 6 }}>
          Live state record via Vitu, checked {when}. Verify the physical title at handover.
        </p>
      </div>
    );
  if (!summary) return null;
  const tone = summary.verdict === "clean" ? "up" : summary.verdict === "issues" ? "down" : "";
  return (
    <div className="panel title-report">
      <div className="lab">Title check · Vitu / NMVTIS</div>
      <div className="title-verdict">
        <span className={`pill ${tone}`}>
          {summary.verdict === "clean"
            ? "No issues found"
            : summary.verdict === "issues"
              ? "Issues found"
              : "Inconclusive"}
        </span>
        <span className="hint">checked {when}</span>
      </div>
      {summary.flags.length ? (
        <ul className="title-flags">
          {summary.flags.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}
      <dl className="kv">
        <dt>VIN</dt>
        <dd className="mono">{summary.vin}</dd>
        <dt>Title brands</dt>
        <dd>{summary.brands.length ? summary.brands.join(", ") : "None reported"}</dd>
        <dt>Theft</dt>
        <dd>
          {summary.theft == null ? "Not reported" : summary.theft ? "Reported stolen" : "None"}
        </dd>
        <dt>Liens</dt>
        <dd>
          {summary.liens == null ? "Not reported" : summary.liens === 0 ? "None" : summary.liens}
        </dd>
        {summary.lastTitleState ? (
          <>
            <dt>Last title</dt>
            <dd>
              {summary.lastTitleState}
              {summary.lastOdometer != null
                ? ` · ${summary.lastOdometer.toLocaleString("en-US")} mi`
                : ""}
            </dd>
          </>
        ) : null}
        {summary.titleRecords ? (
          <>
            <dt>Title records</dt>
            <dd>{summary.titleRecords}</dd>
          </>
        ) : null}
      </dl>
      {mvr ? <MvrReportSection mvr={mvr} /> : null}
      <p className="hint" style={{ marginTop: 6 }}>
        From the National Motor Vehicle Title Information System via Vitu. A clean result is not a
        guarantee; verify the physical title at handover.
      </p>
    </div>
  );
}
