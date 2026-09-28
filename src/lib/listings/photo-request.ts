import { getImageProps } from "next/image";
import { isBlobUrl } from "./blob-url";

/** What an <img> needs to request the same bytes a CardPhoto in a given slot would. */
export type PhotoRequest = { src: string; srcSet?: string; sizes?: string };

/**
 * The request a CardPhoto with these `sizes` makes for `src`. Blob uploads go
 * through next/image, so the browser asks for `/_next/image?url=…&w=…` chosen
 * from a srcset, never the original (which can be a 12 MB upload); external
 * photos are fetched as-is. Prefetching must warm that same candidate, or the
 * warm-up downloads one file and the card then requests another.
 */
export function photoRequest(src: string, sizes: string): PhotoRequest {
  if (!isBlobUrl(src)) return { src };
  const { props } = getImageProps({ src, alt: "", fill: true, sizes });
  return { src: props.src, srcSet: props.srcSet, sizes: props.sizes };
}

/** Warm the browser cache with the photo a CardPhoto in this slot would show. */
export function prefetchPhoto(src: string, sizes: string): void {
  const req = photoRequest(src, sizes);
  const img = new window.Image();
  if (req.sizes) img.sizes = req.sizes;
  if (req.srcSet) img.srcset = req.srcSet;
  img.src = req.src;
}
