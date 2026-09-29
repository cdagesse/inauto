"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { CONSIGNMENT_SERVICES } from "@/lib/sell/consignment";
import { requestConsignment } from "@/server/services";

export interface ConsignmentPrefill {
  year?: string;
  make?: string;
  model?: string;
  trim?: string;
  miles?: string;
  vin?: string;
  estimate?: string;
}

/** The virtual consignment intake: the car, where it is, and which services the seller wants. */
export function ConsignmentForm({ prefill }: { prefill: ConsignmentPrefill }) {
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  if (msg?.ok) {
    return (
      <div className="rec">
        <b>Request received.</b>
        <p>
          {msg.text} You can follow it under <Link href="/tools">Buyer tools</Link>, and we will
          email you within one business day.
        </p>
      </div>
    );
  }
  return (
    <form
      className="form"
      action={(fd) =>
        start(async () => {
          const r = await requestConsignment(fd);
          setMsg(
            r.ok
              ? { ok: true, text: "We have your car and what you would like us to handle." }
              : { ok: false, text: r.error },
          );
        })
      }
    >
      {prefill.estimate ? <input type="hidden" name="estimate" value={prefill.estimate} /> : null}
      <div className="grid-3">
        <div className="fld">
          <label htmlFor="c-year">Year</label>
          <input
            id="c-year"
            name="year"
            type="number"
            required
            min={1900}
            max={2100}
            defaultValue={prefill.year}
          />
        </div>
        <div className="fld">
          <label htmlFor="c-make">Make</label>
          <input id="c-make" name="make" required maxLength={60} defaultValue={prefill.make} />
        </div>
        <div className="fld">
          <label htmlFor="c-model">Model</label>
          <input id="c-model" name="model" required maxLength={80} defaultValue={prefill.model} />
        </div>
      </div>
      <div className="grid-3">
        <div className="fld">
          <label htmlFor="c-trim">Trim or generation</label>
          <input id="c-trim" name="trim" maxLength={80} defaultValue={prefill.trim} />
        </div>
        <div className="fld">
          <label htmlFor="c-miles">Miles</label>
          <input
            id="c-miles"
            name="miles"
            type="number"
            required
            min={0}
            defaultValue={prefill.miles}
          />
        </div>
        <div className="fld">
          <label htmlFor="c-vin">VIN (optional)</label>
          <input
            id="c-vin"
            name="vin"
            className="mono"
            minLength={11}
            maxLength={17}
            autoComplete="off"
            defaultValue={prefill.vin}
            placeholder="WP0AF2A98PS270000"
          />
        </div>
      </div>
      <div className="grid-3">
        <div className="fld" style={{ gridColumn: "span 2" }}>
          <label htmlFor="c-location">Where is the car? (city, state)</label>
          <input
            id="c-location"
            name="location"
            required
            maxLength={120}
            placeholder="Wilmington, DE"
          />
        </div>
        <div className="fld">
          <label htmlFor="c-phone">Phone (optional)</label>
          <input id="c-phone" name="phone" type="tel" maxLength={40} autoComplete="tel" />
        </div>
      </div>
      <fieldset className="fld">
        <legend>What should we handle?</legend>
        <div className="stack">
          {CONSIGNMENT_SERVICES.map((s) => (
            <label key={s.key} className="check">
              <input type="checkbox" name="services" value={s.key} defaultChecked />
              <span>
                <b>{s.label}</b> <span className="hint">{s.blurb}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <div className="fld">
        <label htmlFor="c-notes">Anything we should know? (optional)</label>
        <textarea
          id="c-notes"
          name="notes"
          rows={3}
          maxLength={1500}
          placeholder="Service history, modifications, timing, a price you have in mind."
        />
      </div>
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? "Sending…" : "Request virtual consignment"}
      </button>
      {msg ? <p className={msg.ok ? "note" : "err"}>{msg.text}</p> : null}
    </form>
  );
}
