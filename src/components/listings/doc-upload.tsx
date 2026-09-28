"use client";

import { upload } from "@vercel/blob/client";
import { useUser } from "@clerk/nextjs";
import { useEffect, useId, useState } from "react";

/**
 * One-file upload for purchase evidence (a title photo or a proof-of-ownership
 * video). Uploads straight to a private Vercel Blob prefix under
 * purchases/{clerkId}/ through the same token broker as listing photos. The
 * value handed back is the blob pathname, not a URL: private blobs have no
 * readable URL, so the preview comes from the local file instead.
 */
export function DocUpload({
  label,
  hint,
  accept,
  value,
  onChange,
  slot,
}: {
  label: string;
  hint?: string;
  accept: string;
  value: string | undefined;
  onChange: (pathname: string | undefined) => void;
  slot: string;
}) {
  const { user } = useUser();
  const id = useId();
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ url: string; video: boolean } | null>(null);
  useEffect(() => {
    if (!preview) return;
    const { url } = preview;
    return () => URL.revokeObjectURL(url);
  }, [preview]);
  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!user) return setError("Sign in to upload.");
    if (file.size > 200 * 1024 * 1024) return setError("Larger than 200 MB.");
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-60) || "file";
      const blob = await upload(`purchases/${user.id}/${slot}-${safe}`, file, {
        access: "private",
        handleUploadUrl: "/api/upload",
        onUploadProgress: ({ percentage }) => setPct(Math.round(percentage)),
      });
      setPct(null);
      setPreview({ url: URL.createObjectURL(file), video: file.type.startsWith("video/") });
      onChange(blob.pathname);
    } catch (e) {
      setPct(null);
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
  }
  function replace() {
    setPreview(null);
    onChange(undefined);
  }
  return (
    <div className="fld doc-upload">
      <label htmlFor={id}>{label}</label>
      {value ? (
        <div className="doc-preview">
          {preview?.video ? (
            <video src={preview.url} controls preload="metadata" />
          ) : preview ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.url} alt={label} />
          ) : (
            <span className="hint">Attached</span>
          )}
          <button type="button" className="btn sm" onClick={replace}>
            Replace
          </button>
        </div>
      ) : (
        <input id={id} type="file" accept={accept} onChange={(e) => pick(e.target.files?.[0])} />
      )}
      {pct != null ? <span className="hint">Uploading… {pct}%</span> : null}
      {hint && !value ? <span className="hint">{hint}</span> : null}
      {error ? <span className="err">{error}</span> : null}
    </div>
  );
}
