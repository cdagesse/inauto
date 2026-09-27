import { describe, expect, it } from "vitest";
import { billOfSaleLines } from "@/lib/purchase/bill-of-sale";
import { buildCart, escrowFee } from "@/lib/purchase/pricing";

describe("purchase pricing", () => {
  it("prices escrow at 1% within the floor and cap", () => {
    expect(escrowFee(10_000)).toBe(250);
    expect(escrowFee(80_000)).toBe(800);
    expect(escrowFee(1_000_000)).toBe(2_500);
  });
  it("builds the cart with only the chosen add-ons and separates what is due now", () => {
    const c = buildCart(72_900, {
      inspection: true,
      titleVetting: false,
      escrow: true,
      shipping: true,
    });
    expect(c.items.map((i) => i.key)).toEqual(["vehicle", "inspection", "escrow", "shipping"]);
    expect(c.total).toBe(72_900 + 349 + 729);
    expect(c.dueNow).toBe(349 + 729);
    const none = buildCart(50_000, {
      inspection: false,
      titleVetting: false,
      escrow: false,
      shipping: false,
    });
    expect(none.items).toHaveLength(1);
    expect(none.dueNow).toBe(0);
  });
});

describe("bill of sale", () => {
  it("lists the vehicle, both parties, the price and signature lines", () => {
    const lines = billOfSaleLines({
      purchaseId: "abc-123",
      date: "2026-09-27",
      vehicle: {
        year: 1999,
        make: "Porsche",
        model: "911 Carrera",
        trim: "Carrera 4",
        vin: "WP0AA2996XS620000",
        miles: 12_000,
        color: "Cobalt Blue",
      },
      seller: {
        legalName: "Jim B",
        address: "1 Main St, Hauppauge, NY",
        phone: "555-0100",
        email: "seller@example.com",
      },
      buyer: {
        legalName: "Pat Buyer",
        address: "2 Elm St, Boston, MA",
        phone: "555-0200",
        email: "buyer@example.com",
      },
      price: 72_900,
      mode: "online",
      escrow: true,
    });
    expect(lines).toContain("Description: 1999 Porsche 911 Carrera Carrera 4");
    expect(lines).toContain("VIN: WP0AA2996XS620000");
    expect(lines).toContain("Purchase price: $72,900");
    expect(lines).toContain("Payment: Through a licensed escrow service");
    expect(lines.some((l) => l.startsWith("Seller: ____"))).toBe(true);
    expect(lines.some((l) => l.startsWith("Buyer:  ____"))).toBe(true);
  });
  it("leaves blanks when the seller has not filled their details", () => {
    const lines = billOfSaleLines({
      purchaseId: "x",
      date: "2026-09-27",
      vehicle: {
        year: 2020,
        make: "BMW",
        model: "M2",
        trim: null,
        vin: null,
        miles: 5_000,
        color: null,
      },
      seller: { legalName: "", address: "", phone: "", email: "" },
      buyer: { legalName: "A", address: "B", phone: "C", email: "D" },
      price: 1,
      mode: "in_person",
      escrow: false,
    });
    expect(lines).toContain("VIN: ____________________");
    expect(lines).toContain("Name: ____________________");
    expect(lines).toContain("Payment: In person");
  });
});
