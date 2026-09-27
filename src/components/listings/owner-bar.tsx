"use client";

import Link from "next/link";

type Status = "draft" | "active" | "ended" | "sold" | "withdrawn";

/**
 * Fixed bar at the bottom of a listing page, shown only to its owner: the
 * listing's state and every action they can take on it. Delete asks first.
 */
export function OwnerBar({
  id,
  title,
  status,
  type,
  hasBids,
  actions,
}: {
  id: string;
  title: string;
  status: Status;
  type: "classified" | "auction" | "private";
  hasBids: boolean;
  actions: {
    publish: (fd: FormData) => void | Promise<void>;
    markSold: (fd: FormData) => void | Promise<void>;
    withdraw: (fd: FormData) => void | Promise<void>;
    relist: (fd: FormData) => void | Promise<void>;
    remove: (fd: FormData) => void | Promise<void>;
  };
}) {
  const live = status === "active";
  const editable = status !== "sold";
  const hidden = <input type="hidden" name="id" value={id} />;
  return (
    <div className="owner-bar" role="region" aria-label="Your listing">
      <div className="wrap owner-bar-inner">
        <div className="owner-bar-state">
          <span className="lab">Your listing</span>
          <span className={`pill ${live ? "up" : status === "sold" ? "accent" : ""}`}>
            {status}
          </span>
          {type === "auction" && hasBids ? <span className="hint">has bids</span> : null}
        </div>
        <div className="owner-bar-actions">
          {editable ? (
            <Link href={`/listings/${id}/edit`} className="btn sm">
              Edit
            </Link>
          ) : null}
          {status === "draft" ? (
            <form action={actions.publish}>
              {hidden}
              <button type="submit" className="btn sm primary">
                Publish
              </button>
            </form>
          ) : null}
          {status === "withdrawn" || status === "ended" ? (
            <form action={actions.relist}>
              {hidden}
              <button type="submit" className="btn sm primary">
                Relist
              </button>
            </form>
          ) : null}
          {status === "active" || status === "ended" ? (
            <>
              <form action={actions.markSold}>
                {hidden}
                <button type="submit" className="btn sm">
                  Mark sold
                </button>
              </form>
              <form action={actions.withdraw}>
                {hidden}
                <button type="submit" className="btn sm">
                  Take down
                </button>
              </form>
            </>
          ) : null}
          {!hasBids ? (
            <form
              action={actions.remove}
              onSubmit={(e) => {
                if (!window.confirm(`Delete "${title}"? This cannot be undone.`))
                  e.preventDefault();
              }}
            >
              {hidden}
              <button type="submit" className="btn sm danger">
                Delete
              </button>
            </form>
          ) : null}
        </div>
      </div>
    </div>
  );
}
