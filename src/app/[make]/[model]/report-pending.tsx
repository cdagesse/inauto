"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { requestMarketReport } from "@/server/reports";

type Status = "none" | "requested" | "building" | "ready" | "failed";

const COPY: Record<Exclude<Status, "ready">, string> = {
  none: "Report requested, usually ready within a few minutes.",
  requested: "Report requested, usually ready within a few minutes.",
  building: "Pulling dealer listings and auction results…",
  failed: "We could not build this report yet.",
};

/**
 * Shown while a model has no market data. On mount it asks for a report
 * (idempotent server action), then refreshes the page every 10 seconds
 * for up to 5 minutes so the report appears as soon as the job finishes.
 */
export function ReportPending({
  makeSlug,
  modelSlug,
  status,
  error,
}: {
  makeSlug: string;
  modelSlug: string;
  status: Status;
  error: string | null;
}) {
  const router = useRouter();
  const [local, setLocal] = useState<Status>(status);
  const [requesting, setRequesting] = useState(false);
  const started = useRef<number | null>(null);

  async function request() {
    setRequesting(true);
    const r = await requestMarketReport({ makeSlug, modelSlug });
    if (r.ok) setLocal(r.data.status as Status);
    setRequesting(false);
    router.refresh();
  }

  useEffect(() => {
    if (status !== "none") return;
    let cancelled = false;
    requestMarketReport({ makeSlug, modelSlug }).then((r) => {
      if (cancelled) return;
      if (r.ok) setLocal(r.data.status as Status);
      router.refresh();
    });
    return () => {
      cancelled = true;
    };
  }, [status, makeSlug, modelSlug, router]);

  useEffect(() => {
    if (local === "ready" || local === "failed") return;
    started.current ??= Date.now();
    const t = setInterval(() => {
      if (Date.now() - (started.current ?? 0) > 5 * 60_000) {
        clearInterval(t);
        return;
      }
      router.refresh();
    }, 10_000);
    return () => clearInterval(t);
  }, [local, router]);

  const shown = local === "ready" ? "requested" : local;
  return (
    <div className="panel pending" aria-live="polite">
      <h2 className="sec">Building your market report</h2>
      <div className="status">
        <span className={`dot${shown === "failed" ? " failed" : ""}`} aria-hidden="true" />
        <span>{COPY[shown]}</span>
      </div>
      {shown === "failed" && (
        <>
          <p className="note" style={{ margin: 0 }}>
            {error && !/key|secret|token/i.test(error)
              ? error
              : "Our data sources did not return any sales for this model. We will retry, and you can request it again."}
          </p>
          <div>
            <button type="button" className="btn primary" disabled={requesting} onClick={request}>
              {requesting ? "Requesting…" : "Try again"}
            </button>
          </div>
        </>
      )}
      <ol>
        <li>Pull dealer sold and active listings from Visor</li>
        <li>Pull auction results from Old Cars Data</li>
        <li>Clean, de-duplicate and aggregate by generation</li>
      </ol>
      <p className="note" style={{ margin: 0 }}>
        This page refreshes itself. You can also come back later; the report stays built once it
        exists.
      </p>
    </div>
  );
}
