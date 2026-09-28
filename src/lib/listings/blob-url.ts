/** Public-read Blob store host; listing photos must be uploaded there through UrCar. */
export const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

export const isBlobUrl = (u: string) => {
  try {
    return new URL(u).hostname.endsWith(BLOB_HOST_SUFFIX);
  } catch {
    return false;
  }
};
