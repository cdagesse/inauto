"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createInquiry } from "@/server/purchases";

export function InquireForm({ listingId, title }: { listingId: string; title: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  const [contact, setContact] = useState("");
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (done)
    return (
      <div className="panel">
        <b className="display">Sent.</b>
        <p className="note" style={{ margin: "4px 0 10px" }}>
          The seller sees your question in their garage and can reply to the contact you gave.
        </p>
        <button type="button" className="btn" onClick={() => router.push(`/listings/${listingId}`)}>
          Back to the listing
        </button>
      </div>
    );
  return (
    <form
      className="form panel"
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        start(async () => {
          const r = await createInquiry({ listingId, message, contact: contact || null });
          if (!r.ok) return setError(r.error);
          setDone(true);
        });
      }}
    >
      <div className="fld">
        <label htmlFor="q-msg">Your question about {title}</label>
        <textarea
          id="q-msg"
          rows={6}
          maxLength={4000}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Service history? Where can I see it? Is the price firm?"
          required
        />
      </div>
      <div className="fld">
        <label htmlFor="q-contact">How should the seller reach you? (optional)</label>
        <input
          id="q-contact"
          value={contact}
          onChange={(e) => setContact(e.target.value)}
          maxLength={200}
          placeholder="Phone or email; otherwise your account email"
        />
      </div>
      {error ? <p className="err">{error}</p> : null}
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? "Sending…" : "Send to the seller"}
      </button>
    </form>
  );
}
