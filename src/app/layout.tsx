import type { Metadata } from "next";
import { Archivo, IBM_Plex_Mono, Instrument_Sans } from "next/font/google";
import "./globals.css";

const archivo = Archivo({
  subsets: ["latin"],
  weight: "variable",
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});
const instrument = Instrument_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-instrument",
  display: "swap",
});
const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { Providers } from "@/components/site/providers";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://inauto.vercel.app"),
  title: { default: "InAuto", template: "%s · InAuto" },
  description:
    "Collector car market data, pricing tools, and a safer way to buy and sell: classifieds, auctions, private networks, title vetting and condition reports.",
  openGraph: { siteName: "InAuto", type: "website" },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${archivo.variable} ${instrument.variable} ${plexMono.variable}`}
    >
      <head>
        <script
          // Apply a saved light-theme preference before first paint; dark is the default.
          dangerouslySetInnerHTML={{
            __html: `try{if(localStorage.getItem("inauto-theme")==="light")document.documentElement.setAttribute("data-theme","light")}catch(e){}`,
          }}
        />
      </head>
      <body>
        <Providers>
          <SiteHeader />
          <main className="wrap" style={{ paddingBlock: "0 48px" }}>
            {children}
          </main>
          <SiteFooter />
        </Providers>
      </body>
    </html>
  );
}
