import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";
import { requireUser } from "@/auth";
import { env } from "@/env/server";
import { rateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

const ALLOWED = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 12 * 1024 * 1024;
const UPLOADS_PER_HOUR = 40;

/**
 * Client-upload token broker for Vercel Blob. The browser asks here for a
 * short-lived token scoped to one pathname under listings/{userId}/, then
 * uploads straight to Blob storage, so the file never passes through a
 * function. Photos are attached to a listing at save time, not here.
 */
export async function POST(req: Request) {
  if (!env.BLOB_READ_WRITE_TOKEN)
    return NextResponse.json({ error: "uploads not configured" }, { status: 503 });
  const body = (await req.json()) as HandleUploadBody;
  try {
    const result = await handleUpload({
      request: req,
      body,
      token: env.BLOB_READ_WRITE_TOKEN,
      onBeforeGenerateToken: async (pathname) => {
        let user;
        try {
          user = await requireUser();
        } catch {
          throw new Error("Sign in to upload photos.");
        }
        const rl = rateLimit(`upload:${user.id}`, UPLOADS_PER_HOUR, 60 * 60 * 1000);
        if (!rl.ok) throw new Error("Too many uploads. Try again in a few minutes.");
        const prefix = `listings/${user.id}/`;
        if (!pathname.startsWith(prefix) || pathname.includes(".."))
          throw new Error("Invalid upload path.");
        return {
          allowedContentTypes: ALLOWED,
          maximumSizeInBytes: MAX_BYTES,
          addRandomSuffix: true,
          tokenPayload: JSON.stringify({ userId: user.id }),
        };
      },
      // Blob calls this from the outside after the upload lands. Nothing to
      // persist yet: the client attaches URLs when the listing is saved.
      onUploadCompleted: async () => {},
    });
    return NextResponse.json(result);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Upload failed.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
