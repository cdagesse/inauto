"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { syncUsersFromClerk } from "@/server/clerk-users";

/** "Sync from Clerk": creates rows for Clerk accounts we have not seen yet. */
export function ClerkSyncButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <span className="clerk-sync">
      <button
        type="button"
        className="btn sm"
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await syncUsersFromClerk();
            if (!r.ok) return setMsg(r.error);
            const { seen, created, attached } = r.data;
            setMsg(
              `${seen} Clerk accounts checked · ${created} created · ${attached} attached by email`,
            );
            router.refresh();
          })
        }
      >
        {pending ? "Syncing…" : "Sync from Clerk"}
      </button>
      {msg ? <span className="hint">{msg}</span> : null}
    </span>
  );
}
