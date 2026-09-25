import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { signInHref } from "@/components/account/require-signin";
import { acceptInviteAction } from "@/server/networks";
import { previewInvite } from "@/server/queries/networks";

export const metadata: Metadata = { title: "Network invite", robots: { index: false } };

export default async function InvitePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ error?: string }>;
}) {
  const { token } = await params;
  const sp = await searchParams;
  const [invite, session] = await Promise.all([previewInvite(token), auth()]);
  return (
    <div className="auth-wrap">
      <div className="eyebrow">Private network invite</div>
      {!invite ? (
        <>
          <h1 className="display" style={{ fontSize: 30, margin: "6px 0" }}>
            This invite link is not valid
          </h1>
          <p className="sub">Ask the network owner for a new link.</p>
        </>
      ) : !invite.valid ? (
        <>
          <h1 className="display" style={{ fontSize: 30, margin: "6px 0" }}>
            This invite has expired or was already used
          </h1>
          <p className="sub">
            Invites work once and expire after 7 days. Ask the owner of {invite.name} for a new one.
          </p>
        </>
      ) : (
        <>
          <h1 className="display" style={{ fontSize: 30, margin: "6px 0" }}>
            You are invited to {invite.name}
          </h1>
          <p className="sub">
            Members see the network&apos;s private listings and can list their own cars to the
            group.
          </p>
          {sp.error ? <p className="err">{decodeURIComponent(sp.error)}</p> : null}
          {session?.user ? (
            <form
              action={async (fd: FormData) => {
                "use server";
                const r = await acceptInviteAction(fd);
                if (!r.ok) redirect(`/invite/${token}?error=${encodeURIComponent(r.error)}`);
                redirect(`/networks/${r.data.slug}`);
              }}
            >
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="btn primary">
                Accept invite
              </button>
            </form>
          ) : (
            <Link href={signInHref(`/invite/${token}`)} className="btn primary">
              Sign in to accept
            </Link>
          )}
        </>
      )}
    </div>
  );
}
