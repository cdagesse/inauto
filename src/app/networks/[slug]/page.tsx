import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSignedIn } from "@/components/account/require-signin";
import { fmtDate, usd } from "@/components/account/money";
import { InviteForm } from "@/components/networks/invite-form";
import { revokeInviteForm } from "@/server/forms";
import { getNetworkForMember } from "@/server/queries/networks";

export const metadata: Metadata = { title: "Network" };

export default async function NetworkPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const user = await requireSignedIn(`/networks/${slug}`);
  const data = await getNetworkForMember(slug, user.id);
  if (!data) notFound();
  const { network, isOwner, members, pending, listings } = data;
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">
            <Link href="/networks">Private networks</Link> / {isOwner ? "you own this" : "member"}
          </div>
          <h1 className="display" style={{ fontSize: 40, margin: "6px 0 0" }}>
            {network.name}
          </h1>
          {network.description ? <p className="sub">{network.description}</p> : null}
        </div>
        <Link href="/sell" className="btn primary">
          List a car here
        </Link>
      </div>

      <section className="shelf">
        <h2 className="sec">Listings</h2>
        {listings.length === 0 ? (
          <p className="note">No active listings in this network.</p>
        ) : (
          <div className="car-grid">
            {listings.map((l) => (
              <Link key={l.id} href={`/listings/${l.id}`} className="panel car-card link-card">
                <div className="lab">{l.type} · private</div>
                <h3 className="display" style={{ fontSize: 18, margin: "2px 0 4px" }}>
                  {l.title}
                </h3>
                <div
                  className="num"
                  style={{ fontFamily: "var(--display)", fontSize: 22, fontWeight: 700 }}
                >
                  {l.askingPrice ? usd(l.askingPrice) : "Auction"}
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="grid-2">
        <section className="shelf">
          <h2 className="sec">Members</h2>
          <div className="tw">
            <table>
              <thead>
                <tr>
                  <th>Member</th>
                  <th>Role</th>
                  <th>Joined</th>
                </tr>
              </thead>
              <tbody>
                {members.map((m) => (
                  <tr key={m.userId}>
                    <td>{m.name ?? "Member"}</td>
                    <td>{m.role}</td>
                    <td className="mono">{fmtDate(m.joinedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
        {isOwner ? (
          <section className="shelf">
            <h2 className="sec">Invites</h2>
            <InviteForm networkId={network.id} />
            {pending.length > 0 ? (
              <div className="tw" style={{ marginTop: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>Pending</th>
                      <th>Expires</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {pending.map((i) => (
                      <tr key={i.id}>
                        <td>{i.email ?? <span className="hint">link only</span>}</td>
                        <td className="mono">{fmtDate(i.expiresAt)}</td>
                        <td className="n">
                          <form action={revokeInviteForm}>
                            <input type="hidden" name="inviteId" value={i.id} />
                            <button type="submit" className="btn sm">
                              Revoke
                            </button>
                          </form>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>
        ) : null}
      </div>
    </div>
  );
}
