import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://inauto.vercel.app"),
  title: { default: "InAuto", template: "%s · InAuto" },
  description:
    "Collector car market data, pricing tools, and a safer way to buy and sell: classifieds, auctions, private networks, title vetting and condition reports.",
  openGraph: { siteName: "InAuto", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,400..900&family=Instrument+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&display=swap"
        />
        <script
          // Apply a saved light-theme preference before first paint; dark is the default.
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("inauto-theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`,
          }}
        />
      </head>
      <body>
        <SiteHeader />
        <main className="wrap" style={{ paddingBlock: "0 48px" }}>
          {children}
        </main>
        <SiteFooter />
      </body>
    </html>
  );
}
