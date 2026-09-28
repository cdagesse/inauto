import type { Metadata } from "next";
import Link from "next/link";
import { SellPicker } from "@/components/listings/sell-picker";
import { listSellMakes } from "@/server/queries/sell-catalog";

export const metadata: Metadata = {
  title: "Sell your car",
  description:
    "Pick your year, make, model, trim and mileage to see what your car is worth from real dealer and auction sales, then list it on UrCar in minutes.",
};

export const revalidate = 3600;

export default async function SellPage() {
  const makes = await listSellMakes().catch(() => []);
  return (
    <div>
      <div className="hero sell-hero">
        <div>
          <div className="eyebrow">Sell · Priced from real dealer and auction sales</div>
          <h1 className="hero-title">
            <span>What is your car</span>worth today?
          </h1>
          <p className="sub" style={{ maxWidth: "58ch" }}>
            Tell us the car and we will show you its market value, the three ways to sell it and
            what you would keep from each. Then list it on UrCar: free, priced against real sales,
            with title vetting and inspection so buyers trust the number.
          </p>
        </div>
      </div>
      <SellPicker makes={makes} />
      <section className="props" style={{ paddingTop: 28 }}>
        <div className="panel prop">
          <div className="eyebrow">1 · Value</div>
          <h3>A number you can defend</h3>
          <p>
            Every estimate is fit to real dealer sales and auction hammer prices for your exact
            generation, adjusted for mileage, colour, condition and history.
          </p>
        </div>
        <div className="panel prop">
          <div className="eyebrow">2 · Choose</div>
          <h3>Auction, dealer, or list it yourself</h3>
          <p>
            We show the expected hammer price, a likely dealer offer and a suggested asking price,
            with fees and what you actually keep, side by side.
          </p>
        </div>
        <div className="panel prop">
          <div className="eyebrow">3 · List on UrCar</div>
          <h3>Keep the platform fee</h3>
          <p>
            Classified or 7 to 14 day auction, free to list. Buyers see the same market data you do
            and can order title vetting and an inspection before they commit.
          </p>
        </div>
      </section>
      <p className="note">
        Already know what you want?{" "}
        <Link href="/sell/list" style={{ color: "var(--accent)" }}>
          Go straight to the listing form.
        </Link>
      </p>
    </div>
  );
}
