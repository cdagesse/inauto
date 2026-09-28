/**
 * Public-read Blob store host: own-listing photos are uploaded here and go
 * through next/image; anything else is an external platform's CDN.
 *
 * Kept free of imports so client components can test a URL without pulling
 * zod (or anything else from the server schema) into the browser bundle.
 */
export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export const isBlobUrl = (u: string) => {
  try {
    return new URL(u).hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
};
