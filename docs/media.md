# Listing photos (Vercel Blob)

Photos upload straight from the browser to the public-read Blob store `inauto-media`, never through a function.

1. `PhotoUpload` (client) calls `upload()` from `@vercel/blob/client` with `handleUploadUrl: "/api/upload"`.
2. `POST /api/upload` (`onBeforeGenerateToken`) requires an active signed-in account, caps 40 uploads per user per hour (in memory; the WAF rule on `/api/*` is the durable layer), and only issues tokens for `listings/{userId}/…` with JPEG/PNG/WebP/HEIC up to 12 MB, random suffix on.
3. The browser uploads to Blob with that token and gets a URL like `https://<store>.public.blob.vercel-storage.com/listings/<uid>/<name>-<suffix>.jpg`.
4. URLs are attached to the listing when it is saved (`photos` column, max 24, https only). The first photo is the cover.
5. `PhotoGallery` renders Blob URLs through `next/image` (`images.remotePatterns` in `next.config.ts`); pasted external links render with a plain `<img>`.

## Local development

`vercel env pull` provides `BLOB_READ_WRITE_TOKEN`. The `onUploadCompleted` webhook needs a publicly reachable URL, so it never fires on localhost; nothing depends on it, because photos are attached at save time.

## Not yet done

- Orphaned blobs (uploaded but never saved to a listing) are not garbage-collected. A weekly job could list `listings/` blobs older than 24 h that no listing references and delete them.
- No server-side image resizing beyond `next/image`.
