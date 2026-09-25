import Link from "next/link";
import { fmtDate } from "@/components/account/money";
import { Pager } from "@/components/admin/pager";
import { listAudit } from "@/server/admin/queries";
import { normalizeQuery, parsePage } from "@/server/admin/rules";

export const dynamic = "force-dynamic";

const TARGETS = [
  "user",
  "model",
  "generation",
  "model_alias",
  "service_order",
  "dealer_row",
  "auction_row",
];

export default async function AdminAudit({
  searchParams,
}: {
  searchParams: Promise<{ action?: string; targetType?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const action = normalizeQuery(sp.action);
  const targetType = TARGETS.includes(sp.targetType ?? "") ? sp.targetType : undefined;
  const page = parsePage(sp.page);
  const { rows, total } = await listAudit({ action: action || undefined, targetType, page });
  const qs = new URLSearchParams();
  if (action) qs.set("action", sp.action ?? "");
  if (targetType) qs.set("targetType", targetType);
  const base = `/admin/audit${qs.size ? `?${qs}` : ""}`;
  return (
    <div>
      <form className="admin-search" action="/admin/audit" method="get">
        <input
          name="action"
          defaultValue={sp.action ?? ""}
          placeholder="Action prefix, e.g. user.status"
          maxLength={80}
        />
        <select name="targetType" defaultValue={targetType ?? ""}>
          <option value="">All targets</option>
          {TARGETS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <button className="btn sm" type="submit">
          Filter
        </button>
      </form>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>When</th>
              <th>Admin</th>
              <th>Action</th>
              <th>Target</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="mono">{fmtDate(a.createdAt)}</td>
                <td>{a.adminEmail ?? "cli"}</td>
                <td className="mono">{a.action}</td>
                <td className="mono">
                  {a.targetType === "user" ? (
                    <Link href={`/admin/users/${a.targetId}`}>user {a.targetId.slice(0, 8)}</Link>
                  ) : a.targetType === "model" ? (
                    <Link href={`/admin/models/${a.targetId}`}>model {a.targetId.slice(0, 8)}</Link>
                  ) : (
                    `${a.targetType} ${a.targetId.slice(0, 8)}`
                  )}
                </td>
                <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                  {a.details ? JSON.stringify(a.details).slice(0, 200) : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} href={base} />
    </div>
  );
}
