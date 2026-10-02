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
import { MarketTicker } from "@/components/site/market-ticker";
import { SiteFooter } from "@/components/site/footer";
import { ClerkProvider } from "@clerk/nextjs";
import { clerkAppearance } from "@/components/site/clerk-appearance";

export const metadata: Metadata = {
  // The www host: the bare domain redirects, and scrapers follow og:url and images from here.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "https://www.ur.car"),
  title: { default: "UrCar", template: "%s · UrCar" },
  description:
    "Collector car market data, pricing tools, and a safer way to buy and sell: classifieds, auctions, private networks, title vetting and condition reports.",
  openGraph: { siteName: "UrCar", type: "website" },
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
        {/* Inside <body> so the root layout stays static; Clerk does not force dynamic rendering. */}
        <ClerkProvider appearance={clerkAppearance} signInUrl="/signin" signUpUrl="/signup">
          <SiteHeader />
          <MarketTicker />
          <main className="wrap" style={{ paddingBlock: "0 48px" }}>
            {children}
          </main>
          <SiteFooter />
        </ClerkProvider>
      </body>
    </html>
  );
}
