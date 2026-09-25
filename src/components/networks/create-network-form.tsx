"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createNetwork } from "@/server/networks";

export function CreateNetworkForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="form"
      action={(fd) =>
        start(async () => {
          setError(null);
          const r = await createNetwork(fd);
          if (!r.ok) return setError(r.error);
          router.push(`/networks/${r.data.slug}`);
        })
      }
    >
      <div className="lab">Create a private network</div>
      <div className="fld">
        <label htmlFor="n-name">Name</label>
        <input
          id="n-name"
          name="name"
          required
          minLength={2}
          maxLength={60}
          placeholder="Northeast air-cooled club"
        />
      </div>
      <div className="fld">
        <label htmlFor="n-desc">Description</label>
        <textarea id="n-desc" name="description" rows={2} maxLength={500} />
      </div>
      {error ? <p className="err">{error}</p> : null}
      <div>
        <button type="submit" className="btn primary" disabled={pending}>
          {pending ? "Creating…" : "Create network"}
        </button>
      </div>
    </form>
  );
}
