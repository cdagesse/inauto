"use client";

import { useState, useTransition } from "react";
import { createInvite } from "@/server/networks";

export function InviteForm({ networkId }: { networkId: string }) {
  const [link, setLink] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div className="form">
      <div className="lab">Invite someone</div>
      <form
        action={(fd) =>
          start(async () => {
            setError(null);
            setLink(null);
            const r = await createInvite(fd);
            if (!r.ok) return setError(r.error);
            setLink(`${window.location.origin}/invite/${r.data.token}`);
          })
        }
        style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "end" }}
      >
        <input type="hidden" name="networkId" value={networkId} />
        <div className="fld" style={{ flex: "1 1 220px" }}>
          <label htmlFor="inv-email">Email (optional, for your records)</label>
          <input id="inv-email" name="email" type="email" maxLength={200} />
        </div>
        <button type="submit" className="btn ink" disabled={pending}>
          {pending ? "Creating…" : "Create invite link"}
        </button>
      </form>
      {link ? (
        <div className="invite-link">
          <div className="hint">
            Share this link. It works once and expires in 7 days. It will not be shown again.
          </div>
          <code className="mono">{link}</code>
          <button
            type="button"
            className="btn sm"
            onClick={() => navigator.clipboard?.writeText(link)}
          >
            Copy
          </button>
        </div>
      ) : null}
      {error ? <p className="err">{error}</p> : null}
    </div>
  );
}
