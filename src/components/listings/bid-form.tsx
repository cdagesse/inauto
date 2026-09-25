"use client";

import { useActionState } from "react";
import { placeBidAction } from "@/server/listings";
import { usd } from "@/components/account/money";

export function BidForm({ listingId, minimum }: { listingId: string; minimum: number }) {
  const [state, action, pending] = useActionState(placeBidAction, null);
  return (
    <form action={action} className="form">
      <div className="lab">Place a bid</div>
      <input type="hidden" name="listingId" value={listingId} />
      <div className="fld">
        <label htmlFor="bid-amount">Your bid (minimum {usd(minimum)})</label>
        <input
          id="bid-amount"
          name="amount"
          type="number"
          min={minimum}
          step={100}
          defaultValue={minimum}
          inputMode="numeric"
          required
        />
      </div>
      <button type="submit" className="btn primary" disabled={pending}>
        {pending ? "Placing…" : "Bid"}
      </button>
      {state ? (
        state.ok ? (
          <p className="note">You are the high bidder at {usd(state.data.amount)}.</p>
        ) : (
          <p className="err">{state.error}</p>
        )
      ) : null}
      <p className="hint">
        Bids are binding. Order a title check and condition report before you bid.
      </p>
    </form>
  );
}
