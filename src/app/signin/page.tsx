import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth, providerList, signIn } from "@/auth";

export const metadata: Metadata = { title: "Sign in" };

function safeCallback(raw: string | undefined) {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/garage";
}

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const callbackUrl = safeCallback(sp.callbackUrl);
  const session = await auth();
  if (session?.user) redirect(callbackUrl);
  const oauth = providerList.filter((p) => p.id !== "dev");
  const dev = providerList.find((p) => p.id === "dev");
  return (
    <div className="auth-wrap">
      <div className="eyebrow">Account</div>
      <h1 className="display" style={{ fontSize: 34, margin: "6px 0 4px" }}>
        Sign in to InAuto
      </h1>
      <p className="sub">
        Your garage, wish list, listings and private networks live behind your account.
      </p>
      {sp.error ? <p className="err">Sign-in failed. Please try again.</p> : null}
      <div className="form">
        {oauth.map((p) => (
          <form
            key={p.id}
            action={async () => {
              "use server";
              await signIn(p.id, { redirectTo: callbackUrl });
            }}
          >
            <button
              type="submit"
              className="btn primary"
              style={{ width: "100%", justifyContent: "center" }}
            >
              Continue with {p.name}
            </button>
          </form>
        ))}
        {oauth.length === 0 && !dev ? (
          <p className="note">
            No sign-in providers are configured. Set AUTH_GOOGLE_* or AUTH_GITHUB_* in the
            environment.
          </p>
        ) : null}
        {dev ? (
          <form
            action={async (fd: FormData) => {
              "use server";
              await signIn("dev", {
                email: String(fd.get("email") ?? ""),
                name: String(fd.get("name") ?? ""),
                redirectTo: callbackUrl,
              });
            }}
            className="dev-form"
          >
            <div className="lab">Development sign-in (local only)</div>
            <div className="fld">
              <label htmlFor="email">Email</label>
              <input id="email" name="email" type="email" required autoComplete="email" />
            </div>
            <div className="fld">
              <label htmlFor="name">Name</label>
              <input id="name" name="name" type="text" maxLength={80} autoComplete="name" />
            </div>
            <button type="submit" className="btn ink">
              Sign in
            </button>
          </form>
        ) : null}
      </div>
    </div>
  );
}
