"use client";

import { useState } from "react";
import { brandLogoUrl, type LogoSize, LOGO_PX, monogram } from "@/lib/brand/logo";

/**
 * Brand mark for a make. Uses the Motomarks CDN when NEXT_PUBLIC_MOTOMARKS_TOKEN
 * is set and falls back to a monogram tile when it is not, or when the CDN has
 * no logo for the brand (the image 404s and we swap to the monogram).
 */
export function BrandLogo({
  make,
  size = "sm",
  px,
  type = "badge",
  className,
}: {
  /** Make name or catalog slug, e.g. "Porsche" or "mercedes-amg". */
  make: string;
  size?: LogoSize;
  /** Rendered size in CSS pixels; defaults to a sensible size for the preset. */
  px?: number;
  type?: "full" | "badge" | "wordmark";
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const url = brandLogoUrl(make, { size, type });
  const dim = px ?? Math.round(LOGO_PX[size] / 2);
  const cls = `brand-logo${className ? ` ${className}` : ""}`;
  if (!url || failed) {
    return (
      <span
        className={`${cls} mono-tile`}
        style={{ width: dim, height: dim, fontSize: Math.max(11, Math.round(dim * 0.38)) }}
        aria-label={make}
        role="img"
        title={make}
      >
        {monogram(make)}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={cls}
      src={url}
      alt={`${make} logo`}
      title={make}
      width={dim}
      height={dim}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      style={{ width: dim, height: dim }}
    />
  );
}
