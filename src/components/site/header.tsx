import Link from "next/link";
import { auth } from "@/auth";
import { ThemeToggle } from "./theme-toggle";
import { UserMenu } from "./user-menu";

export async function SiteHeader() {
  const session = await auth();
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
          <UserMenu user={session?.user ?? null} />
        </div>
      </div>
    </header>
  );
}
