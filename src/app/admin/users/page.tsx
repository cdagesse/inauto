import Link from "next/link";
import { fmtDate } from "@/components/account/money";
import { Pager } from "@/components/admin/pager";
import { StatusPill } from "@/components/admin/status-pill";
import { listUsers } from "@/server/admin/queries";
import { normalizeQuery, parsePage } from "@/server/admin/rules";

export const dynamic = "force-dynamic";

export default async function AdminUsers({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const sp = await searchParams;
  const q = normalizeQuery(sp.q);
  const page = parsePage(sp.page);
  const { rows, total } = await listUsers(q, page);
  const base = `/admin/users${q ? `?q=${encodeURIComponent(sp.q ?? "")}` : ""}`;
  return (
    <div>
      <form className="admin-search" action="/admin/users" method="get">
        <input
          name="q"
          defaultValue={sp.q ?? ""}
          placeholder="Search email or name"
          maxLength={80}
        />
        <button className="btn sm" type="submit">
          Search
        </button>
      </form>
      <div className="tw">
        <table>
          <thead>
            <tr>
              <th>Email</th>
              <th>Name</th>
              <th>Role</th>
              <th>Status</th>
              <th>Joined</th>
              <th className="n">Garage</th>
              <th className="n">Listings</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((u) => (
              <tr key={u.id}>
                <td>
                  <Link href={`/admin/users/${u.id}`}>{u.email ?? u.id.slice(0, 8)}</Link>
                </td>
                <td>{u.name ?? ""}</td>
                <td className="mono">{u.role}</td>
                <td>
                  <StatusPill value={u.status} />
                </td>
                <td className="mono">{fmtDate(u.createdAt)}</td>
                <td className="n">{Number(u.garageCount)}</td>
                <td className="n">{Number(u.listingCount)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pager page={page} total={total} href={base} />
    </div>
  );
}
