import { fmtDate } from "@/components/account/money";
import { Flash } from "@/components/admin/flash";
import { TitleReportCard } from "@/components/listings/title-report-card";
import { env } from "@/env/server";
import type { TitleSummary } from "@/lib/sources/vitu";
import type { MvrSummary } from "@/lib/sources/vitu-mvr";
import {
  createVituTest,
  deleteVituTest,
  listVituTests,
  refreshVituTest,
} from "@/server/admin/vitu-test";

export const dynamic = "force-dynamic";

export default async function AdminVitu({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listVituTests();
  const cfg = env.vitu;
  return (
    <div>
      <div className="panel" style={{ marginBottom: 16 }}>
        <div className="lab">Vitu VIN test</div>
        <p className="hint" style={{ margin: "4px 0 10px" }}>
          {cfg
            ? `Credentials set · NMVTIS ${cfg.nmvtis ? "on" : "off"} · MVR ${cfg.mvr ? "on" : "off"} · ${cfg.authUrl.includes("auth.test") ? "sandbox" : cfg.authUrl.includes("stage") ? "stage" : "production"}`
            : "VITU_CLIENT_ID / VITU_CLIENT_SECRET are not set; checks will be skipped."}{" "}
          Each run creates real inquiries (both products bill per inquiry). Results arrive
          asynchronously: use Refresh, or wait for the notification webhook.
        </p>
        <form action={createVituTest} className="vitu-test-form">
          <label>
            VIN
            <input
              name="vin"
              required
              maxLength={17}
              placeholder="17-char VIN or sandbox test string"
              className="mono"
            />
          </label>
          <label>
            State
            <input name="state" required maxLength={2} placeholder="NY" style={{ width: 60 }} />
          </label>
          <label>
            Seller name (optional)
            <input name="sellerName" placeholder="to compare with the registered owner" />
          </label>
          <label>
            Listing miles (optional)
            <input name="miles" type="number" min={0} placeholder="to compare with odometer" />
          </label>
          <button className="btn primary" type="submit">
            Run checks
          </button>
        </form>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      {rows.length === 0 ? (
        <p className="note">No test runs yet.</p>
      ) : (
        rows.map((r) => {
          const d = (r.details ?? {}) as Record<string, unknown>;
          const res = (r.result ?? {}) as { summary?: TitleSummary; mvr?: MvrSummary };
          const test = (d.test ?? {}) as { state?: string; sellerName?: string; miles?: number };
          const nm = d.nmvtis as { inquiryId?: number | null; refNumber?: string } | undefined;
          const mv = d.mvr as { inquiryId?: number | null; refNumber?: string } | undefined;
          const nmErr = d.nmvtisLastError as { at: string; notes: string[] } | undefined;
          const mvErr = d.mvrLastError as { at: string; notes: string[] } | undefined;
          return (
            <div key={r.id} className="panel vitu-test-row">
              <div className="vitu-test-head">
                <div>
                  <span className="mono" style={{ fontWeight: 700 }}>
                    {r.vin}
                  </span>{" "}
                  · {test.state ?? "?"}
                  {test.sellerName ? ` · ${test.sellerName}` : ""}
                  {typeof test.miles === "number"
                    ? ` · ${test.miles.toLocaleString("en-US")} mi`
                    : ""}
                  <div className="hint">
                    {fmtDate(r.createdAt)} · {r.status}
                    {nm
                      ? ` · NMVTIS inquiry ${nm.inquiryId || "pending id"} (ref ${nm.refNumber})`
                      : " · NMVTIS not started"}
                    {mv
                      ? ` · MVR inquiry ${mv.inquiryId || "pending id"} (ref ${mv.refNumber})`
                      : " · MVR not started"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <form action={refreshVituTest}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn" type="submit">
                      Refresh
                    </button>
                  </form>
                  <form action={deleteVituTest}>
                    <input type="hidden" name="id" value={r.id} />
                    <button className="btn ghost" type="submit">
                      Remove
                    </button>
                  </form>
                </div>
              </div>
              {res.summary || res.mvr ? (
                <TitleReportCard
                  summary={res.summary ?? null}
                  mvr={res.mvr ?? null}
                  when={fmtDate(r.reviewedAt ?? r.createdAt)}
                />
              ) : (
                <p className="hint">No results yet.</p>
              )}
              {nmErr || mvErr ? (
                <div className="vitu-errors">
                  {nmErr ? (
                    <p className="err">
                      NMVTIS ({fmtDate(new Date(nmErr.at))}): {nmErr.notes.join(" | ")}
                    </p>
                  ) : null}
                  {mvErr ? (
                    <p className="err">
                      MVR ({fmtDate(new Date(mvErr.at))}): {mvErr.notes.join(" | ")}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <details>
                <summary className="hint">Raw Vitu responses</summary>
                <pre className="vitu-raw">
                  {JSON.stringify(
                    {
                      nmvtis: {
                        create: d.nmvtisCreateResponse,
                        inquiry: d.nmvtisInquiry,
                        record: d.report,
                      },
                      mvr: {
                        create: d.mvrCreateResponse,
                        inquiry: d.mvrInquiry,
                        record: d.mvrRecord,
                      },
                    },
                    null,
                    2,
                  )}
                </pre>
              </details>
            </div>
          );
        })
      )}
    </div>
  );
}
