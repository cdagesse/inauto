import Link from "next/link";
import { notFound } from "next/navigation";
import { auth } from "@/auth";
import { fmtDate, mi, usd } from "@/components/account/money";
import { Flash } from "@/components/admin/flash";
import { StatusPill } from "@/components/admin/status-pill";
import { setUserRoleForm, setUserStatusForm } from "@/server/admin/actions";
import { getUserDetail } from "@/server/admin/queries";

export const dynamic = "force-dynamic";

const SHELVES = [
  ["wishlist", "Wish list"],
  ["owned", "Currently own"],
  ["previous", "Previously owned"],
] as const;

export default async function AdminUserPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ ok?: string; error?: string }>;
}) {
  const [{ id }, sp, session] = await Promise.all([params, searchParams, auth()]);
  const d = await getUserDetail(id);
  if (!d) notFound();
  const { user } = d;
  const isSelf = session?.user?.id === user.id;
  const locked = isSelf || user.role === "admin";
  return (
    <div>
      <Link href="/admin/users" className="mono" style={{ color: "var(--ink-3)" }}>
        ← Users
      </Link>
      <div className="page-head" style={{ paddingTop: 12 }}>
        <div>
          <h2 className="display" style={{ fontSize: 28, margin: 0 }}>
            {user.name ?? user.email ?? user.id}
          </h2>
          <p className="sub" style={{ margin: "4px 0 0" }}>
            {user.email} · <span className="mono">{user.role}</span> ·{" "}
            <StatusPill value={user.status} /> · joined {fmtDate(user.createdAt)}
            {user.statusReason ? (
              <>
                {" "}
                · last status change {fmtDate(user.statusChangedAt)}: “{user.statusReason}”
              </>
            ) : null}
          </p>
        </div>
      </div>
      <Flash ok={sp.ok} error={sp.error} />

      <div className="grid-2" style={{ marginTop: 12 }}>
        <section className="panel">
          <div className="lab">Account status</div>
          {locked ? (
            <p className="note">
              {isSelf
                ? "You cannot change your own account."
                : "Admin accounts are managed with the CLI (pnpm users:role)."}
            </p>
          ) : (
            <form action={setUserStatusForm} className="admin-form">
              <input type="hidden" name="id" value={user.id} />
              <div className="fld">
                <label htmlFor="reason">Reason (recorded in the audit log)</label>
                <textarea
                  id="reason"
                  name="reason"
                  required
                  minLength={3}
                  maxLength={500}
                  rows={2}
                />
              </div>
              <div className="admin-actions">
                {user.status !== "active" ? (
                  <button className="btn sm primary" name="status" value="active">
                    Reactivate
                  </button>
                ) : null}
                {user.status !== "disabled" ? (
                  <button className="btn sm" name="status" value="disabled">
                    Disable
                  </button>
                ) : null}
                {user.status !== "blocked" ? (
                  <button className="btn sm danger" name="status" value="blocked">
                    Block (withdraws active listings)
                  </button>
                ) : null}
              </div>
            </form>
          )}
        </section>
        <section className="panel">
          <div className="lab">Role</div>
          {locked ? (
            <p className="note">Admin promotion and demotion happen only through the CLI.</p>
          ) : (
            <form action={setUserRoleForm} className="admin-form">
              <input type="hidden" name="id" value={user.id} />
              <div className="fld">
                <label htmlFor="role">Role</label>
                <select id="role" name="role" defaultValue={user.role}>
                  <option value="user">user</option>
                  <option value="dealer">dealer</option>
                </select>
              </div>
              <div className="admin-actions">
                <button className="btn sm" type="submit">
                  Save role
                </button>
              </div>
              <p className="hint">
                Promote to admin with <code>pnpm users:role {user.email} admin</code>.
              </p>
            </form>
          )}
        </section>
      </div>

      <section style={{ paddingTop: 28 }}>
        <h3 className="sec">Garage</h3>
        {SHELVES.map(([key, title]) => {
          const cars = d.garage.filter((c) => c.status === key);
          return (
            <div key={key} style={{ marginTop: 14 }}>
              <div className="lab">
                {title} · {cars.length}
              </div>
              {cars.length === 0 ? (
                <p className="note">None.</p>
              ) : (
                <div className="tw">
                  <table>
                    <thead>
                      <tr>
                        <th>Car</th>
                        <th className="n">Miles</th>
                        <th>Color</th>
                        <th className="n">Paid</th>
                        <th className="n">Sold for</th>
                        <th>Added</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cars.map((c) => (
                        <tr key={c.id}>
                          <td>
                            {c.year ? `${c.year} ` : ""}
                            {c.make} {c.model} {c.trim ?? ""}
                            {c.nickname ? <span className="hint"> “{c.nickname}”</span> : null}
                          </td>
                          <td className="n">{c.miles != null ? mi(c.miles) : ""}</td>
                          <td>{c.color ?? ""}</td>
                          <td className="n">
                            {c.purchasePrice != null ? usd(c.purchasePrice) : ""}
                          </td>
                          <td className="n">{c.salePrice != null ? usd(c.salePrice) : ""}</td>
                          <td className="mono">{fmtDate(c.createdAt)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </section>

      <section style={{ paddingTop: 28 }}>
        <h3 className="sec">Listings · {d.listings.length}</h3>
        {d.listings.length === 0 ? (
          <p className="note">No listings.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th className="n">Asking</th>
                  <th className="n">High bid</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {d.listings.map((l) => (
                  <tr key={l.id}>
                    <td>
                      <Link href={`/listings/${l.id}`}>{l.title}</Link>
                    </td>
                    <td className="mono">{l.type}</td>
                    <td>
                      <StatusPill value={l.status} />
                    </td>
                    <td className="n">{l.askingPrice != null ? usd(l.askingPrice) : ""}</td>
                    <td className="n">{l.highBid != null ? usd(Number(l.highBid)) : ""}</td>
                    <td className="mono">{fmtDate(l.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ paddingTop: 28 }}>
        <h3 className="sec">Service orders · {d.orders.length}</h3>
        {d.orders.length === 0 ? (
          <p className="note">No orders.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Kind</th>
                  <th>Status</th>
                  <th>VIN</th>
                  <th>Requested</th>
                  <th>Reviewed</th>
                </tr>
              </thead>
              <tbody>
                {d.orders.map((o) => (
                  <tr key={o.id}>
                    <td className="mono">{o.kind}</td>
                    <td>
                      <StatusPill value={o.status} />
                    </td>
                    <td className="mono">{o.vin ?? ""}</td>
                    <td className="mono">{fmtDate(o.createdAt)}</td>
                    <td className="mono">{o.reviewedAt ? fmtDate(o.reviewedAt) : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section style={{ paddingTop: 28 }}>
        <h3 className="sec">Admin history</h3>
        {d.history.length === 0 ? (
          <p className="note">No admin actions on this account.</p>
        ) : (
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Admin</th>
                  <th>Action</th>
                  <th>Details</th>
                </tr>
              </thead>
              <tbody>
                {d.history.map((h) => (
                  <tr key={h.id}>
                    <td className="mono">{fmtDate(h.createdAt)}</td>
                    <td>{h.adminEmail ?? "cli"}</td>
                    <td className="mono">{h.action}</td>
                    <td className="mono" style={{ fontSize: 11.5, color: "var(--ink-3)" }}>
                      {h.details ? JSON.stringify(h.details) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
