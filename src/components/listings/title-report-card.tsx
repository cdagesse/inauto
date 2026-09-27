import type { TitleSummary } from "@/lib/sources/vitu";

/** The result of a title check, for the buyer who ordered it and the listing owner. */
export function TitleReportCard({ summary, when }: { summary: TitleSummary; when: string }) {
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
      <p className="hint" style={{ marginTop: 6 }}>
        From the National Motor Vehicle Title Information System via Vitu. A clean result is not a
        guarantee; verify the physical title at handover.
      </p>
    </div>
  );
}
