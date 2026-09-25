import Link from "next/link";

export function SiteFooter() {
  return (
    <footer className="wrap site-footer">
      <div>
        <div className="brand" style={{ fontSize: 14 }}>
          <i aria-hidden="true" />
          InAuto
        </div>
        <p className="note">
          Market data from dealer listings (Visor) and auction results (Old Cars Data). Estimates are
          not offers. Always vet the title and get a condition report before you send money.
        </p>
      </div>
      <nav aria-label="Footer">
        <Link href="/markets">Markets</Link>
        <Link href="/listings">Listings</Link>
        <Link href="/sell">Sell a car</Link>
        <Link href="/tools">Buyer tools</Link>
        <Link href="/networks">Private networks</Link>
      </nav>
    </footer>
  );
}
