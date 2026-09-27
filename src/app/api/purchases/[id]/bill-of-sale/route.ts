import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { renderBillOfSale } from "@/lib/purchase/bill-of-sale";
import { getPurchaseForViewer } from "@/server/queries/purchases";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Bill of sale PDF for a purchase request; only the buyer and the seller can fetch it. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const session = await auth();
  if (!session) return NextResponse.json({ error: "Sign in." }, { status: 401 });
  const p = await getPurchaseForViewer(id, session.user.id);
  if (!p) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const sd = p.listing.sellerDetails ?? {};
  const bytes = await renderBillOfSale({
    purchaseId: p.purchase.id,
    date: (p.purchase.respondedAt ?? p.purchase.createdAt).toISOString().slice(0, 10),
    vehicle: {
      year: p.listing.year,
      make: p.listing.make,
      model: p.listing.model,
      trim: p.listing.trim,
      vin: p.listing.vin,
      miles: p.listing.miles,
      color: p.listing.color,
    },
    seller: {
      legalName: sd.legalName ?? p.sellerName ?? "",
      address: sd.address ?? "",
      phone: sd.phone ?? "",
      email: p.sellerEmail ?? "",
    },
    buyer: p.purchase.buyer,
    price: p.purchase.price,
    mode: p.purchase.mode,
    escrow: p.purchase.options.escrow,
  });
  return new NextResponse(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `inline; filename="bill-of-sale-${p.purchase.id.slice(0, 8)}.pdf"`,
      "Cache-Control": "private, no-store",
    },
  });
}
