import Link from "next/link";
import { HeaderHeight } from "./header-height";
import { MobileMenu } from "./mobile-menu";
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
        <Link href="/" className="brand" aria-label="UrCar home">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/urcar-dark.png" alt="" className="brand-img dark" aria-hidden="true" />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/brand/urcar-light.png" alt="" className="brand-img light" aria-hidden="true" />
          <span className="sr-only">UrCar</span>
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
          <MobileMenu />
        </div>
      </div>
    </header>
  );
}
