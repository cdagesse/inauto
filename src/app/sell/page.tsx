import type { Metadata } from "next";
import { requireSignedIn } from "@/components/account/require-signin";
import { SellWizard } from "@/components/listings/sell-wizard";
import { listMyNetworks } from "@/server/queries/networks";

export const metadata: Metadata = { title: "Sell a car" };

export default async function SellPage() {
  const user = await requireSignedIn("/sell");
  const nets = await listMyNetworks(user.id);
  return (
    <div>
      <div className="page-head">
        <div>
          <div className="eyebrow">Sell</div>
          <h1 className="display" style={{ fontSize: 40, margin: "6px 0 0" }}>
            List your car
          </h1>
          <p className="sub">
            Describe the car, pick how you want to sell it, and we will tell you whether your price
            is high or low against real dealer and auction sales before it goes live.
          </p>
        </div>
      </div>
      <SellWizard networks={nets.map((n) => ({ id: n.id, name: n.name }))} />
    </div>
  );
}
