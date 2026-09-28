"use client";

import Image from "next/image";
import { useState, type ReactNode } from "react";
import { isBlobUrl } from "@/lib/listings/blob-url";

/**
 * One photo filling its (positioned) parent. UrCar blob uploads go through
 * next/image so they are resized and served with srcset; external platform
 * photos are plain lazy <img>s since their hosts are not in remotePatterns.
 * `priority` marks the page's LCP image: eager, fetchPriority high, preloaded.
 * `onError` fires when the host refuses or has removed the file, so the caller
 * can show a placeholder instead of the browser's broken-image glyph.
 */
export function Pic({
  src,
  alt,
  priority,
  sizes,
  contain,
  onError,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes: string;
  contain?: boolean;
  onError?: () => void;
}) {
  const style = { objectFit: contain ? ("contain" as const) : ("cover" as const) };
  if (isBlobUrl(src)) {
    return (
      <Image
        src={src}
        alt={alt}
        fill
        sizes={sizes}
        priority={priority}
        style={style}
        onError={onError}
      />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      onError={onError}
      style={{ ...style, position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}

/** Card thumbnails: the grid uses minmax(260px, 1fr), so a card is a column on phones. */
export const CARD_SIZES = "(max-width: 720px) 100vw, 33vw";

/** What a card shows when it has no photo, or its photo will not load. */
export function PhotoFallback() {
  return (
    <span className="photo-fallback">
      <span className="lab">No photo</span>
    </span>
  );
}

/**
 * The decorative photo box on a car card. Renders `children` (a placeholder,
 * or a plain "No photo" tile) when there is no photo, or when the photo fails
 * to load: platforms move and delete files after a sale, so a stored URL can
 * die at any time. The box is aria-hidden: the card's text carries the
 * meaning, so the image is never announced twice.
 */
export function CardPhoto({
  src,
  className = "photo",
  sizes = CARD_SIZES,
  priority,
  children,
}: {
  src: string | null | undefined;
  className?: string;
  sizes?: string;
  priority?: boolean;
  children?: ReactNode;
}) {
  // Remembering which URL failed (not just "failed") keeps a card that re-renders with a
  // new photo from staying on the placeholder.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const show = src && src !== failedSrc ? src : null;
  return (
    <div className={className} aria-hidden="true">
      {show ? (
        <Pic
          src={show}
          alt=""
          sizes={sizes}
          priority={priority}
          onError={() => setFailedSrc(show)}
        />
      ) : (
        (children ?? <PhotoFallback />)
      )}
    </div>
  );
}
