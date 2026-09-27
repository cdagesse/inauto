"use client";

import Link from "next/link";
import { useTransition } from "react";

function Pencil() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}
function Trash() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/**
 * Pencil (edit) and trash (delete) for a listing the viewer owns. Delete asks
 * for confirmation, then submits the server form action.
 */
export function ListingRowActions({
  id,
  title,
  canEdit,
  canDelete,
  hasBids,
  deleteAction,
}: {
  id: string;
  title: string;
  canEdit: boolean;
  canDelete: boolean;
  hasBids: boolean;
  deleteAction: (fd: FormData) => void | Promise<void>;
}) {
  const [pending, start] = useTransition();
  return (
    <div className="row-actions">
      {canEdit ? (
        <Link
          href={`/listings/${id}/edit`}
          className="btn sm icon"
          aria-label={`Edit ${title}`}
          title="Edit"
        >
          <Pencil />
        </Link>
      ) : null}
      {canDelete ? (
        <form
          action={deleteAction}
          onSubmit={(e) => {
            const msg = hasBids
              ? `"${title}" has bids. Deleting it removes the auction and its bids for good. Continue?`
              : `Delete "${title}"? This cannot be undone.`;
            if (!window.confirm(msg)) e.preventDefault();
          }}
        >
          <input type="hidden" name="id" value={id} />
          <button
            type="submit"
            className="btn sm icon danger"
            aria-label={`Delete ${title}`}
            title="Delete"
            disabled={pending}
            onClick={() => start(() => {})}
          >
            <Trash />
          </button>
        </form>
      ) : null}
    </div>
  );
}
