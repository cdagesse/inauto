import Link from "next/link";
import { fmtDate } from "@/components/account/money";
import { dashboardStats } from "@/server/admin/queries";

export const dynamic = "force-dynamic";

function Card({
  label,
  value,
  sub,
  href,
}: {
  label: string;
  value: number | string;
  sub?: string;
  href: string;
}) {
  return (
    <Link href={href} className="panel stat-card">
      <div className="lab">{label}</div>
      <div className="stat-value num">{value}</div>
      {sub ? <div className="hint">{sub}</div> : null}
    </Link>
  );
}

export default async function AdminHome() {
  const s = await dashboardStats();
  const u = s.users;
  const l = s.listings;
  const m = s.models;
  const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
  return (
    <div>
      <div className="stat-grid">
        <Card
          label="Users"
          value={sum(u)}
          sub={`${u.active ?? 0} active · ${u.disabled ?? 0} disabled · ${u.blocked ?? 0} blocked`}
          href="/admin/users"
        />
        <Card
          label="Listings"
          value={sum(l)}
          sub={`${l.active ?? 0} active · ${l.draft ?? 0} draft · ${l.sold ?? 0} sold · ${l.withdrawn ?? 0} withdrawn`}
          href="/admin/users"
        />
        <Card label="Title vetting pending" value={s.pendingTitle} href="/admin/vetting" />
        <Card
          label="Condition reports pending"
          value={s.pendingCondition}
          href="/admin/vetting?kind=condition_report"
        />
        <Card
          label="Rows to review"
          value={s.reviewCount}
          sub="flagged or excluded market rows"
          href="/admin/review"
        />
        <Card
          label="Models"
          value={sum(m)}
          sub={`${m.ready ?? 0} ready · ${m.requested ?? 0} requested · ${m.building ?? 0} building · ${m.failed ?? 0} failed`}
          href="/admin/models"
        />
      </div>

      <section style={{ paddingTop: 28 }}>
        <h2 className="sec">Recent admin actions</h2>
        <p className="sub">Last 20 entries. The full log is under Audit log.</p>
        <div className="tw">
          <table>
            <thead>
              <tr>
                <th>When</th>
                <th>Admin</th>
                <th>Action</th>
                <th>Target</th>
              </tr>
            </thead>
            <tbody>
              {s.recent.length === 0 ? (
                <tr>
                  <td colSpan={4} className="note">
                    No admin actions yet.
                  </td>
                </tr>
              ) : (
                s.recent.map((a) => (
                  <tr key={a.id}>
                    <td className="mono">{fmtDate(a.createdAt)}</td>
                    <td>{a.adminEmail ?? "system"}</td>
                    <td className="mono">{a.action}</td>
                    <td className="mono">
                      {a.targetType === "user" ? (
                        <Link href={`/admin/users/${a.targetId}`}>{a.targetId.slice(0, 8)}</Link>
                      ) : a.targetType === "model" ? (
                        <Link href={`/admin/models/${a.targetId}`}>{a.targetId.slice(0, 8)}</Link>
                      ) : (
                        `${a.targetType} ${a.targetId.slice(0, 8)}`
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
