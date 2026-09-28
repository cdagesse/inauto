"use client";

import Link from "next/link";
import { useEffect } from "react";
import { reportClientError } from "@/lib/report-error";
import "./globals.css";

/**
 * Last-resort boundary for errors thrown by the root layout itself. It replaces
 * the layout, so it renders its own <html> and <body> and imports the global
 * stylesheet; fonts fall back to the system stacks declared in the tokens.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    reportClientError("global", error);
  }, [error]);

  return (
    <html lang="en" suppressHydrationWarning>
      <body style={{ background: "var(--paper, #111315)", color: "var(--ink, #eef0f1)" }}>
        <main className="wrap" style={{ paddingBlock: "64px 48px" }}>
          <div className="panel" style={{ padding: 24, maxWidth: 640 }}>
            <div className="eyebrow">UrCar · Something went wrong</div>
            <h1 className="display" style={{ fontSize: 28, margin: "8px 0 0" }}>
              We couldn&apos;t load UrCar.
            </h1>
            <p className="note" style={{ margin: "8px 0 16px" }}>
              Try again in a moment.
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
            </div>
          </div>
        </main>
      </body>
    </html>
  );
}
