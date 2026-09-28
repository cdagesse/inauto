import type { Metadata } from "next";
import Link from "next/link";
import { SearchBox } from "@/components/site/search";

export const metadata: Metadata = {
  title: "Page not found",
  robots: { index: false },
};

/**
 * Branded 404, rendered inside the normal header and footer for every
 * notFound() call and unmatched route. The search box takes people to the
 * make or model they were probably after.
 */
export default function NotFound() {
  return (
    <section className="hero" style={{ paddingBlock: "48px 32px" }}>
      <div style={{ maxWidth: 640 }}>
        <div className="eyebrow">404 · Page not found</div>
        <h1 className="display" style={{ fontSize: 32, margin: "8px 0 0" }}>
          That page isn&apos;t here.
        </h1>
        <p className="note" style={{ margin: "8px 0 18px" }}>
          The listing may have been withdrawn or sold, or the link may be out of date. Search for a
          make or model to find its cars for sale and market report.
        </p>
        <div className="search" role="search">
          <SearchBox size="hero" placeholder="Search a make or model, e.g. Porsche 911" />
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 18 }}>
          <Link href="/" className="btn primary">
            Home
          </Link>
          <Link href="/listings" className="btn">
            Cars for sale
          </Link>
          <Link href="/markets" className="btn">
            Market reports
          </Link>
          <Link href="/sell" className="btn">
            Sell yours
          </Link>
        </div>
      </div>
    </section>
  );
}
