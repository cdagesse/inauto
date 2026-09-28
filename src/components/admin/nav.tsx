import Link from "next/link";

const ITEMS = [
  ["/admin", "Overview"],
  ["/admin/health", "Health"],
  ["/admin/users", "Users"],
  ["/admin/models", "Models"],
  ["/admin/review", "Outlier review"],
  ["/admin/vetting", "Vetting"],
  ["/admin/vitu", "Vitu test"],
  ["/admin/featured", "Featured"],
  ["/admin/audit", "Audit log"],
] as const;

export function AdminNav() {
  return (
    <nav className="admin-nav" aria-label="Admin">
      {ITEMS.map(([href, label]) => (
        <Link key={href} href={href}>
          {label}
        </Link>
      ))}
    </nav>
  );
}
