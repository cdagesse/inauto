import type { Metadata } from "next";
import { z } from "zod";
import { requireSignedIn } from "@/components/account/require-signin";
import { SellWizard, type SellWizardInitial } from "@/components/listings/sell-wizard";
import { listMyNetworks } from "@/server/queries/networks";
import { env } from "@/env/server";

export const metadata: Metadata = { title: "List your car" };

const prefill = z.object({
  make: z.string().trim().max(60).optional(),
  model: z.string().trim().max(80).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  trim: z.string().trim().max(80).optional(),
  miles: z.coerce.number().int().min(0).max(2_000_000).optional(),
  type: z.enum(["classified", "auction", "private"]).optional(),
  weissach: z.enum(["1", "0"]).optional(),
  colorClass: z.enum(["std", "spec", "pts"]).optional(),
  condition: z.enum(["ex", "good", "fair"]).optional(),
  history: z.enum(["clean", "acc"]).optional(),
});

export default async function SellListPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [k, v] of Object.entries(sp)) if (v) qs.set(k, v);
  const back = qs.toString() ? `/sell/list?${qs.toString()}` : "/sell/list";
  const user = await requireSignedIn(back);
  const nets = await listMyNetworks(user.id);
  const parsed = prefill.safeParse(sp);
  const p = parsed.success ? parsed.data : {};
  const initial: SellWizardInitial = {
    make: p.make,
    model: p.model,
    year: p.year != null ? String(p.year) : undefined,
    trim: p.trim,
    miles: p.miles != null ? String(p.miles) : undefined,
    type: p.type,
    weissach: p.weissach === "1",
    colorClass: p.colorClass,
    condition: p.condition,
    history: p.history,
  };
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
      <SellWizard
        networks={nets.map((n) => ({ id: n.id, name: n.name }))}
        initial={initial}
        assistantEnabled={!!env.ANTHROPIC_API_KEY}
      />
    </div>
  );
}
