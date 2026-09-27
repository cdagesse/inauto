"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { respondToPurchase } from "@/server/purchases";

/** Seller's accept / decline / complete controls on a purchase request. */
export function PurchaseResponse({ id, status }: { id: string; status: string }) {
  const router = useRouter();
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const act = (decision: "accepted" | "declined" | "completed") =>
    start(async () => {
      setError(null);
      if (
        decision === "completed" &&
        !window.confirm("Mark this sale complete? The listing becomes Sold.")
      )
        return;
      const r = await respondToPurchase({ id, decision, note: note || null });
      if (!r.ok) return setError(r.error);
      router.refresh();
    });
  return (
    <div className="panel">
      <div className="lab">Respond</div>
      <div className="fld" style={{ marginTop: 8 }}>
        <label htmlFor="s-note">Note to the buyer (optional)</label>
        <textarea
          id="s-note"
          rows={3}
          maxLength={2000}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </div>
      {error ? <p className="err">{error}</p> : null}
      <div className="card-actions">
        {status === "submitted" ? (
          <button
            type="button"
            className="btn primary sm"
            disabled={pending}
            onClick={() => act("accepted")}
          >
            Accept
          </button>
        ) : null}
        {status === "accepted" ? (
          <button
            type="button"
            className="btn primary sm"
            disabled={pending}
            onClick={() => act("completed")}
          >
            Mark sale complete
          </button>
        ) : null}
        <button
          type="button"
          className="btn sm danger"
          disabled={pending}
          onClick={() => act("declined")}
        >
          Decline
        </button>
      </div>
    </div>
  );
}
