import { redirect } from "next/navigation";
import { auth } from "@/auth";

/** Resolves the signed-in user for a page, or redirects to /signin with a safe callback. */
export async function requireSignedIn(callbackUrl: string) {
  const session = await auth();
  if (!session?.user?.id) redirect(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  return session.user;
}
