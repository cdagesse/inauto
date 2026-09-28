"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useId, useState } from "react";
import { SearchBox } from "./search";

const LINKS = [
  ["/listings", "Buy"],
  ["/sell", "Sell"],
  ["/markets", "Market reports"],
  ["/tools", "Buyer tools"],
  ["/garage", "Garage"],
] as const;

/** Hamburger for small screens: opens a panel with the primary links and search. */
export function MobileMenu() {
  const pathname = usePathname();
  const id = useId();
  // The menu is "open" only for the path it was opened on, so a route change closes it
  // without an effect.
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const setOpen = (v: boolean) => setOpenAt(v ? pathname : null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenAt(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        className="btn sm icon-btn menu-btn"
        aria-expanded={open}
        aria-controls={id}
        aria-label={open ? "Close menu" : "Open menu"}
        onClick={() => setOpen(!open)}
      >
        {open ? (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6 6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M4 7h16M4 12h16M4 17h16"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        )}
      </button>
      <div id={id} className={`mobile-menu${open ? " open" : ""}`} hidden={!open}>
        <div className="mobile-menu-search" role="search">
          <SearchBox size="hero" placeholder="Search a make or model" />
        </div>
        <nav aria-label="Primary" className="mobile-nav">
          {LINKS.map(([href, label]) => (
            <Link key={href} href={href} className={pathname === href ? "on" : ""}>
              {label}
            </Link>
          ))}
        </nav>
      </div>
    </>
  );
}
