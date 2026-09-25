"use client";

import { SessionProvider } from "next-auth/react";

export function Providers({ children }: { children: React.ReactNode }) {
  // No initial session is passed, so the provider fetches it client-side and
  // server-rendered pages need no cookie access.
  return <SessionProvider refetchOnWindowFocus={false}>{children}</SessionProvider>;
}
