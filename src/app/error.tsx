"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";

/**
 * Route error boundary: catches a thrown render or data error on any page and
 * shows a branded panel inside the normal header and footer, with a retry that
 * re-renders the segment. The digest is Next's server-side reference for the
 * error, so it is shown for support without leaking the message.
 */
export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError("page", error);
  }, [error]);

  return (
    <section className="hero" style={{ paddingBlock: "48px 32px" }}>
      <div className="panel empty-shelf" style={{ padding: 24, maxWidth: 640 }}>
        <div className="eyebrow">Something went wrong</div>
        <h1 className="display" style={{ fontSize: 28, margin: "8px 0 0" }}>
          We couldn&apos;t load this page.
        </h1>
        <p className="note" style={{ margin: "8px 0 16px" }}>
          It is usually a momentary hiccup on our side. Try again, or head back to the market
          reports and listings.
          {error.digest ? (
            <>
              {" "}
              Reference <code style={{ fontFamily: "var(--mono)" }}>{error.digest}</code>.
            </>
          ) : null}
        </p>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="btn primary" onClick={() => reset()}>
            Try again
          </button>
          <Link href="/" className="btn">
            Home
          </Link>
          <Link href="/listings" className="btn">
            Cars for sale
          </Link>
        </div>
      </div>
    </section>
  );
}
