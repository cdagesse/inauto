import type { Metadata } from "next";

/** The site's own 1200×630 card, served by src/app/opengraph-image.tsx. */
export const SITE_PREVIEW_IMAGE = { url: "/opengraph-image", width: 1200, height: 630 };

/**
 * Open Graph and Twitter tags for a page that stands for one car, so a link shared in
 * iMessage, Slack or a social post shows the car's photo and a one-line summary rather
 * than the site's generic card. Only an https photo is offered; without one the site's
 * own card stands in, since a page-level openGraph block replaces the root's images.
 * Previews are fetched by the other side, so a dead or hotlink-protected photo simply
 * leaves the card without one.
 */
export function carPreview(input: {
  title: string;
  description: string;
  photos: readonly (string | null | undefined)[];
  /** Site-relative path; resolved against metadataBase. */
  path: string;
}): Pick<Metadata, "description" | "openGraph" | "twitter"> {
  const photo = input.photos.find((p): p is string => !!p && /^https:\/\//i.test(p)) ?? null;
  const image = photo
    ? { url: photo, alt: input.title }
    : { ...SITE_PREVIEW_IMAGE, alt: input.title };
  return {
    description: input.description,
    openGraph: {
      siteName: "UrCar",
      title: input.title,
      description: input.description,
      type: "website",
      url: input.path,
      images: [image],
    },
    twitter: {
      card: "summary_large_image",
      title: input.title,
      description: input.description,
      images: [image.url],
    },
  };
}

/** "2000 Porsche 911 · 41,000 mi · Douglassville, PA" from whatever parts are known. */
export function carLine(parts: readonly (string | number | null | undefined)[]): string {
  return parts
    .map((p) => (p == null ? "" : String(p).trim()))
    .filter(Boolean)
    .join(" · ");
}
