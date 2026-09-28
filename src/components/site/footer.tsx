import Link from "next/link";
import { motomarksToken } from "@/lib/brand/logo";

export function SiteFooter() {
  const logos = !!motomarksToken();
  return (
    <footer className="wrap site-footer">
      <div>
        <div className="brand brand-sm">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/urcar-dark.png" alt="" className="brand-img dark" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/urcar-light.png" alt="" className="brand-img light" aria-hidden="true" />
          <span className="sr-only">UrCar</span>
        </div>
        <p className="note">
          Market data from dealer listings (Visor) and auction results (Old Cars Data). Estimates
          are not offers. Always vet the title and get a condition report before you send money.
          {logos ? (
            <>
              {" "}
              Brand logos by{" "}
              <a href="https://motomarks.io" rel="noopener noreferrer" target="_blank">
                Motomarks
              </a>
              . All automotive brand logos and trademarks are property of their respective owners.
            </>
          ) : null}
        </p>
      </div>
      <nav aria-label="Footer">
        <Link href="/listings">Buy</Link>
        <Link href="/sell">Sell a car</Link>
        <Link href="/markets">Market reports</Link>
        <Link href="/tools">Buyer tools</Link>
        <Link href="/networks">Private networks</Link>
      </nav>
    </footer>
  );
}
