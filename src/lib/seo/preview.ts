import type { Metadata } from "next";

/**
 * Open Graph and Twitter tags for a page that stands for one car, so a link shared in
 * iMessage, Slack or a social post shows the car's photo and a one-line summary rather
 * than the site's generic card. Only an https photo is offered; previews are fetched by
 * the other side, so a dead or hotlink-protected photo simply leaves the card without one.
 */
export function carPreview(input: {
  title: string;
  description: string;
  photos: readonly (string | null | undefined)[];
  /** Site-relative path; resolved against metadataBase. */
  path: string;
}): Pick<Metadata, "description" | "openGraph" | "twitter"> {
  const photo = input.photos.find((p): p is string => !!p && /^https:\/\//i.test(p)) ?? null;
  return {
    description: input.description,
    openGraph: {
      title: input.title,
      description: input.description,
      type: "website",
      url: input.path,
      ...(photo ? { images: [{ url: photo, alt: input.title }] } : {}),
    },
    twitter: {
      card: photo ? "summary_large_image" : "summary",
      title: input.title,
      description: input.description,
      ...(photo ? { images: [photo] } : {}),
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
