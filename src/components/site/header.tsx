import Link from "next/link";
import { HeaderHeight } from "./header-height";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";
import { SearchBox } from "./search";

/**
 * No session read here on purpose: reading cookies in the root layout would make
 * every route dynamic. The user menu resolves its session on the client, so
 * market pages stay statically cached at the CDN.
 */
export function SiteHeader() {
  return (
    <header className="site-head">
      <HeaderHeight />
      <div className="wrap bar">
        <Link href="/" className="brand">
          <i aria-hidden="true" />
          InAuto
        </Link>
        <nav className="nav" aria-label="Primary">
          <Link href="/listings">Buy</Link>
          <Link href="/sell">Sell</Link>
          <Link href="/markets">Market reports</Link>
          <Link href="/tools">Buyer tools</Link>
        </nav>
        <div className="bar-right">
          <SearchBox size="compact" placeholder="Search e.g. Mercedes S63" />
          <ThemeToggle />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
