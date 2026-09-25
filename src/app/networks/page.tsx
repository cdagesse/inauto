import type { Metadata } from "next";
import Link from "next/link";
import { requireSignedIn } from "@/components/account/require-signin";
import { fmtDate } from "@/components/account/money";
import { CreateNetworkForm } from "@/components/networks/create-network-form";
import { listMyNetworks } from "@/server/queries/networks";

export const metadata: Metadata = { title: "Private networks" };

export default async function NetworksPage() {
  const user = await requireSignedIn("/networks");
  const nets = await listMyNetworks(user.id);
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Invite-only</div>
          <h1 className="display" style={{ fontSize: 40, margin: "6px 0 0" }}>
            Private networks
          </h1>
          <p className="sub">
            Sell to people you trust before the public sees the car. Members see private listings;
            nobody else does.
          </p>
        </div>
      </div>
      <div className="grid-2">
        <div>
          {nets.length === 0 ? (
            <p className="note">
              You are not in any networks yet. Create one, or accept an invite link.
            </p>
          ) : (
            <div className="tw">
              <table>
                <thead>
                  <tr>
                    <th>Network</th>
                    <th>Role</th>
                    <th>Since</th>
                  </tr>
                </thead>
                <tbody>
                  {nets.map((n) => (
                    <tr key={n.id}>
                      <td>
                        <Link href={`/networks/${n.slug}`}>{n.name}</Link>
                        {n.description ? <div className="hint">{n.description}</div> : null}
                      </td>
                      <td>
                        {n.ownerId === user.id ? (
                          <span className="pill accent">Owner</span>
                        ) : (
                          <span className="pill">Member</span>
                        )}
                      </td>
                      <td className="mono">{fmtDate(n.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <CreateNetworkForm />
      </div>
    </div>
  );
}
