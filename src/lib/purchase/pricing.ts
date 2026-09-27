/**
 * Purchase add-ons and the cart. Pure and tested. Prices are the launch
 * assumptions; change them here, not in components.
 */
export interface PurchaseOptions {
  inspection: boolean;
  titleVetting: boolean;
  escrow: boolean;
  shipping: boolean;
}

export const ADDONS = {
  inspection: {
    label: "Independent inspection report",
    blurb:
      "A mechanic in the seller's area inspects the car and sends you a written report with photos.",
    price: 349,
  },
  titleVetting: {
    label: "Title vetting",
    blurb:
      "We pull the title history and check for liens, brands and mileage discrepancies against the VIN.",
    price: 99,
  },
  escrow: {
    label: "Escrow service",
    blurb:
      "Your money is held by a licensed escrow agent and released to the seller only when the title and car are in your hands.",
    /** 1% of the price, floored and capped. */
    rate: 0.01,
    min: 250,
    max: 2_500,
  },
  shipping: {
    label: "Enclosed shipping quote",
    blurb:
      "We request enclosed-transport quotes to your address. Nothing is charged until you accept a quote.",
    price: 0,
  },
} as const;

export function escrowFee(price: number): number {
  return Math.min(
    ADDONS.escrow.max,
    Math.max(ADDONS.escrow.min, Math.round(price * ADDONS.escrow.rate)),
  );
}

export interface CartItem {
  key: string;
  label: string;
  amount: number;
}

export function buildCart(
  price: number,
  o: PurchaseOptions,
): { items: CartItem[]; total: number; dueNow: number } {
  const items: CartItem[] = [{ key: "vehicle", label: "Vehicle price", amount: price }];
  if (o.inspection)
    items.push({
      key: "inspection",
      label: ADDONS.inspection.label,
      amount: ADDONS.inspection.price,
    });
  if (o.titleVetting)
    items.push({
      key: "titleVetting",
      label: ADDONS.titleVetting.label,
      amount: ADDONS.titleVetting.price,
    });
  if (o.escrow)
    items.push({
      key: "escrow",
      label: `${ADDONS.escrow.label} (1%, min $250)`,
      amount: escrowFee(price),
    });
  if (o.shipping)
    items.push({ key: "shipping", label: `${ADDONS.shipping.label} (quoted later)`, amount: 0 });
  const total = items.reduce((a, i) => a + i.amount, 0);
  // Services are paid to InAuto now; the vehicle is paid to the seller (or into escrow).
  const dueNow = total - price;
  return { items, total, dueNow };
}

/** Which safeguards we insist on for a remote purchase. */
export const ONLINE_STEPS = [
  "Never wire money to a private seller directly. Use escrow, or pay in person at a bank after the title is in hand.",
  "Ask for the title photographed front and back, and a short video of the seller with the car and the VIN plate.",
  "Order title vetting so liens and brands surface before money moves.",
  "Get an independent inspection: a stranger's photos are not a condition report.",
  "Use enclosed transport with a bill of lading that lists the VIN and condition at pickup.",
] as const;
