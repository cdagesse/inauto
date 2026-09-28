import Link from "next/link";
import { fmtDate } from "@/components/account/money";
import { Flash } from "@/components/admin/flash";
import { toggleFeaturedForm } from "@/server/admin/featured";
import { listFeaturedForAdmin } from "@/server/queries/featured";

export const dynamic = "force-dynamic";

export default async function AdminFeatured({
  searchParams,
}: {
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const rows = await listFeaturedForAdmin();
  return (
    <div>
      <p className="hint" style={{ margin: "0 0 12px" }}>
        Cars that rotate in the home page hero, in this order. Add one from the admin bar at the
        bottom of any UrCar listing or platform auction page. Ended or removed cars drop out of the
        rotation automatically but stay listed here until removed.
      </p>
      <Flash ok={sp.ok} error={sp.error} />
      {rows.length === 0 ? (
        <p className="note">
          Nothing featured yet; the home page shows the newest listings with photos instead.
        </p>
      ) : (
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Car</th>
                <th>Kind</th>
                <th>Status</th>
                <th>Added</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={r.id}>
                  <td className="mono">{i + 1}</td>
                  <td>{r.href ? <Link href={r.href}>{r.title}</Link> : r.title}</td>
                  <td>{r.kind === "listing" ? "UrCar listing" : "Platform auction"}</td>
                  <td>
                    <span
                      className={`pill ${r.status === "active" || r.status === "live" ? "up" : ""}`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="mono">{fmtDate(r.createdAt)}</td>
                  <td>
                    <form action={toggleFeaturedForm}>
                      <input type="hidden" name="kind" value={r.kind} />
                      <input type="hidden" name="refId" value={r.refId} />
                      <input type="hidden" name="back" value="/admin/featured" />
                      <button type="submit" className="btn sm">
                        Remove
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
