import Image from "next/image";
import type { ReactNode } from "react";
import { isBlobUrl } from "@/lib/listings/blob-url";

/**
 * One photo filling its (positioned) parent. UrCar blob uploads go through
 * next/image so they are resized and served with srcset; external platform
 * photos are plain lazy <img>s since their hosts are not in remotePatterns.
 * `priority` marks the page's LCP image: eager, fetchPriority high, preloaded.
 */
export function Pic({
  src,
  alt,
  priority,
  sizes,
  contain,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes: string;
  contain?: boolean;
}) {
  const style = { objectFit: contain ? ("contain" as const) : ("cover" as const) };
  if (isBlobUrl(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} style={style} />;
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : undefined}
      decoding="async"
      style={{ ...style, position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}

/** Card thumbnails: the grid uses minmax(260px, 1fr), so a card is a column on phones. */
export const CARD_SIZES = "(max-width: 720px) 100vw, 33vw";

/**
 * The decorative photo box on a car card. Renders `children` (a placeholder)
 * when there is no photo. The box is aria-hidden: the card's text carries the
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
  return (
    <div className={className} aria-hidden="true">
      {src ? <Pic src={src} alt="" sizes={sizes} priority={priority} /> : children}
    </div>
  );
}
