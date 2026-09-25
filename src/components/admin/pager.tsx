import Link from "next/link";
import { PAGE_SIZE } from "@/server/admin/rules";

export function Pager({
  page,
  total,
  href,
}: {
  page: number;
  total: number;
  /** Base URL without the page param, e.g. "/admin/users?q=foo". */
  href: string;
}) {
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const sep = href.includes("?") ? "&" : "?";
  const link = (p: number) => `${href}${sep}page=${p}`;
  return (
    <div className="pager">
      <span className="mono" style={{ color: "var(--ink-3)" }}>
        {total.toLocaleString("en-US")} total · page {page} of {pages}
      </span>
      <span style={{ display: "flex", gap: 6 }}>
        {page > 1 ? (
          <Link className="btn sm" href={link(page - 1)}>
            Previous
          </Link>
        ) : null}
        {page < pages ? (
          <Link className="btn sm" href={link(page + 1)}>
            Next
          </Link>
        ) : null}
      </span>
    </div>
  );
}
