"use client";

import { useState, useTransition } from "react";
import { orderService } from "@/server/services";

export function ServiceOrderForm({
  kind,
  listingId,
  showVin = false,
  label,
  initialVin,
}: {
  kind: "title_vetting" | "condition_report";
  listingId?: string;
  showVin?: boolean;
  label?: string;
  initialVin?: string;
}) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className={showVin ? "form" : "inline-form"}
      action={(fd) =>
        start(async () => {
          const r = await orderService(fd);
          setMsg(
            r.ok
              ? { ok: true, text: "Order received. We'll email you when the report is ready." }
              : { ok: false, text: r.error },
          );
        })
      }
    >
      <input type="hidden" name="kind" value={kind} />
      {listingId ? <input type="hidden" name="listingId" value={listingId} /> : null}
      {showVin ? (
        <div className="fld">
          <label htmlFor={`vin-${kind}`}>VIN</label>
          <input
            id={`vin-${kind}`}
            name="vin"
            defaultValue={initialVin}
            required
            minLength={11}
            maxLength={17}
            autoComplete="off"
            className="mono"
            placeholder="WP0AF2A98PS270000"
          />
        </div>
      ) : null}
      <button type="submit" className="btn primary" disabled={pending}>
        {pending
          ? "Sending…"
          : (label ??
            (kind === "title_vetting" ? "Order title vetting" : "Order condition report"))}
      </button>
      {msg ? <p className={msg.ok ? "note" : "err"}>{msg.text}</p> : null}
    </form>
  );
}
