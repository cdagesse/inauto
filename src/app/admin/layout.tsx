import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { auth } from "@/auth";
import { AdminNav } from "@/components/admin/nav";

export const metadata: Metadata = { title: "Admin", robots: { index: false, follow: false } };
export const dynamic = "force-dynamic";

/**
 * Gate for everything under /admin. Signed-out visitors go to sign-in;
 * signed-in non-admins get a 404 so the console's existence is not confirmed.
 * Every mutation re-checks the role server-side via requireAdmin().
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id) redirect("/signin?redirect_url=%2Fadmin");
  if (session.user.role !== "admin") notFound();
  return (
    <div className="admin">
      <div className="page-head">
        <div>
          <div className="eyebrow">Admin console</div>
          <h1 className="display" style={{ fontSize: 32, margin: "6px 0 0" }}>
            InAuto operations
          </h1>
        </div>
        <AdminNav />
      </div>
      {children}
    </div>
  );
}
