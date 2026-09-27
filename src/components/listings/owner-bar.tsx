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
  isOwner = true,
  admin,
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
  /** False for an admin viewing someone else's listing: only the admin section shows. */
  isOwner?: boolean;
  /** Present for admins: the remove action with a reason field. */
  admin?: {
    remove: (fd: FormData) => void | Promise<void>;
    back: string;
    /** Home page feature toggle. */
    feature?: { action: (fd: FormData) => void | Promise<void>; featured: boolean };
  };
}) {
  const live = status === "active";
  const editable = status !== "sold";
  const hidden = <input type="hidden" name="id" value={id} />;
  return (
    <div className="owner-bar" role="region" aria-label={isOwner ? "Your listing" : "Admin"}>
      <div className="wrap owner-bar-inner">
        <div className="owner-bar-state">
          <span className="lab">{isOwner ? "Your listing" : "Admin"}</span>
          <span className={`pill ${live ? "up" : status === "sold" ? "accent" : ""}`}>
            {status}
          </span>
          {type === "auction" && hasBids ? <span className="hint">has bids</span> : null}
        </div>
        <div className="owner-bar-actions">
          {isOwner && editable ? (
            <Link href={`/listings/${id}/edit`} className="btn sm">
              Edit
            </Link>
          ) : null}
          {isOwner && status === "draft" ? (
            <form action={actions.publish}>
              {hidden}
              <button type="submit" className="btn sm primary">
                Publish
              </button>
            </form>
          ) : null}
          {isOwner && (status === "withdrawn" || status === "ended") ? (
            <form action={actions.relist}>
              {hidden}
              <button type="submit" className="btn sm primary">
                Relist
              </button>
            </form>
          ) : null}
          {isOwner && (status === "active" || status === "ended") ? (
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
          {isOwner && !hasBids ? (
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
          {admin ? (
            <>
              {admin.feature ? (
                <form action={admin.feature.action}>
                  <input type="hidden" name="kind" value="listing" />

                  <input type="hidden" name="refId" value={id} />

                  <input type="hidden" name="back" value={`/listings/${id}`} />

                  <button
                    type="submit"
                    className={`btn sm${admin.feature.featured ? "" : " primary"}`}
                  >
                    {admin.feature.featured ? "Remove from home page" : "Feature on home page"}
                  </button>
                </form>
              ) : null}
              <form
                action={admin.remove}
                className="admin-remove"
                onSubmit={(e) => {
                  if (
                    !window.confirm(
                      `Remove "${title}" for everyone? Bids are deleted; the seller keeps their account.`,
                    )
                  )
                    e.preventDefault();
                }}
              >
                {hidden}
                <input type="hidden" name="back" value={admin.back} />
                <input name="reason" placeholder="Reason (audit log)" maxLength={500} />
                <button type="submit" className="btn sm danger">
                  Remove listing
                </button>
              </form>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
