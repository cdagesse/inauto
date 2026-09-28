import { ImageResponse } from "next/og";

/**
 * Default link-preview image for pages that stand for no single car (home, markets,
 * model reports). Car pages set their own photo through carPreview().
 */
export const alt =
  "UrCar: collector car market data, pricing tools, and a safer way to buy and sell";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

/**
 * The renderer ships one regular-weight face and ignores fontWeight without a registered
 * font, so the wordmark's bold comes from Google Fonts (Archivo, the site's display face),
 * fetched once per instance. If that fetch fails the card still renders, in regular weight.
 */
let boldFont: Promise<ArrayBuffer | null> | null = null;
function loadBold(): Promise<ArrayBuffer | null> {
  boldFont ??= fetch(
    "https://fonts.gstatic.com/s/archivo/v25/k3k6o8UDI-1M0wlSV9XAw6lQkqWY8Q82sJaRE-NWIDdgffTTtDRp8A.ttf",
  )
    .then((r) => (r.ok ? r.arrayBuffer() : null))
    .catch(() => null);
  return boldFont;
}

export default async function OpenGraphImage() {
  const bold = await loadBold();
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "72px 80px",
        background: "linear-gradient(135deg, #0b0c10 0%, #15171e 60%, #1c2030 100%)",
        color: "#f4f4f5",
        fontFamily: bold ? "Archivo" : "sans-serif",
      }}
    >
      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
        <span style={{ fontSize: 96, fontWeight: 800, letterSpacing: -4, color: "#7dd3fc" }}>
          UR
        </span>
        <span style={{ fontSize: 96, fontWeight: 800, letterSpacing: -4 }}>Car</span>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ fontSize: 44, fontWeight: 800, lineHeight: 1.15 }}>
          Real prices for collector cars.
        </div>
        <div style={{ fontSize: 28, color: "#a1a1aa", lineHeight: 1.3, fontWeight: 400 }}>
          Dealer sales, auction results and market reports by make, model and generation. Buy, sell
          and value with the numbers in front of you.
        </div>
      </div>
      <div style={{ fontSize: 26, color: "#71717a", letterSpacing: 4, fontWeight: 400 }}>
        UR.CAR
      </div>
    </div>,
    {
      ...size,
      fonts: bold ? [{ name: "Archivo", data: bold, weight: 800, style: "normal" }] : [],
    },
  );
}
