import Link from "next/link";
import { fmtDate } from "@/components/account/money";
import { Flash } from "@/components/admin/flash";
import { Pager } from "@/components/admin/pager";
import { StatusPill } from "@/components/admin/status-pill";
import { serviceOrderActionForm } from "@/server/admin/actions";
import { listServiceQueue } from "@/server/admin/queries";
import { parsePage } from "@/server/admin/rules";

export const dynamic = "force-dynamic";

export default async function AdminVetting({
  searchParams,
}: {
  searchParams: Promise<{
    kind?: string;
    all?: string;
    page?: string;
    ok?: string;
    error?: string;
  }>;
}) {
  const sp = await searchParams;
  const kind = sp.kind === "condition_report" ? "condition_report" : "title_vetting";
  const showClosed = sp.all === "1";
  const page = parsePage(sp.page);
  const { rows, total } = await listServiceQueue(kind, showClosed, page);
  const base = `/admin/vetting?kind=${kind}${showClosed ? "&all=1" : ""}`;
  const back = `${base}&page=${page}`;
  return (
    <div>
      <div className="admin-tabs">
        <Link
          href="/admin/vetting?kind=title_vetting"
          className={kind === "title_vetting" ? "on" : ""}
        >
          Title vetting
        </Link>
        <Link
          href="/admin/vetting?kind=condition_report"
          className={kind === "condition_report" ? "on" : ""}
        >
          Condition reports
        </Link>
        <Link
          href={`${base.replace("&all=1", "")}${showClosed ? "" : "&all=1"}`}
          className="hint"
          style={{ marginLeft: "auto" }}
        >
          {showClosed ? "Show open only" : "Show closed too"}
        </Link>
      </div>
      <Flash ok={sp.ok} error={sp.error} />
      {rows.length === 0 ? (
        <p className="note">Queue is empty.</p>
      ) : (
        rows.map(
          ({
            order: o,
            requesterEmail,
            requesterName,
            listingTitle,
            listingVin,
            listingTitleVetted,
          }) => {
            const open = o.status === "requested" || o.status === "in_progress";
            const details = (o.details ?? {}) as { notes?: string };
            return (
              <div key={o.id} className="panel admin-order">
                <div className="admin-block-head">
                  <StatusPill value={o.status} />
                  <b>{o.vin ?? listingVin ?? "No VIN"}</b>
                  <span className="hint">
                    requested {fmtDate(o.createdAt)} by {requesterName ?? requesterEmail}
                    {o.listingId ? (
                      <>
                        {" "}
                        · <Link href={`/listings/${o.listingId}`}>{listingTitle ?? "listing"}</Link>
                        {listingTitleVetted ? <span className="pill up"> vetted</span> : null}
                      </>
                    ) : null}
                  </span>
                </div>
                {details.notes ? (
                  <p className="sub" style={{ margin: "6px 0" }}>
                    “{details.notes}”
                  </p>
                ) : null}
                {o.reviewNote ? (
                  <p className="hint">
                    Review note: {o.reviewNote} ({o.reviewedAt ? fmtDate(o.reviewedAt) : ""})
                  </p>
                ) : null}
                {open ? (
                  <form action={serviceOrderActionForm} className="admin-form">
                    <input type="hidden" name="id" value={o.id} />
                    <input type="hidden" name="back" value={back} />
                    <div className="grid-3">
                      <div className="fld" style={{ gridColumn: "span 2" }}>
                        <label htmlFor={`note-${o.id}`}>Note (required to decline)</label>
                        <input id={`note-${o.id}`} name="note" maxLength={1000} />
                      </div>
                      <div className="fld">
                        <label htmlFor={`url-${o.id}`}>Report URL (optional, https)</label>
                        <input id={`url-${o.id}`} name="reportUrl" type="url" maxLength={500} />
                      </div>
                    </div>
                    <div className="admin-actions">
                      {o.status === "requested" ? (
                        <button className="btn sm" name="action" value="start" type="submit">
                          Start
                        </button>
                      ) : null}
                      <button
                        className="btn sm primary"
                        name="action"
                        value="complete"
                        type="submit"
                      >
                        {kind === "title_vetting" ? "Mark title vetted" : "Mark complete"}
                      </button>
                      <button className="btn sm danger" name="action" value="decline" type="submit">
                        Decline
                      </button>
                    </div>
                  </form>
                ) : null}
              </div>
            );
          },
        )
      )}
      <Pager page={page} total={total} href={base} />
    </div>
  );
}
