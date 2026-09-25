import Link from "next/link";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

/**
 * No session read here on purpose: reading cookies in the root layout would make
 * every route dynamic. The user menu resolves its session on the client, so
 * market pages stay statically cached at the CDN.
 */
export function SiteHeader() {
  return (
    <header className="wrap">
      <div className="bar">
        <Link href="/" className="brand">
          <i aria-hidden="true" />
          InAuto
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link href="/markets">Markets</Link>
          <Link href="/listings">Buy</Link>
          <Link href="/sell">Sell</Link>
          <Link href="/tools">Buyer tools</Link>
          <Link href="/garage">Garage</Link>
        </nav>
        <div className="bar-right">
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
