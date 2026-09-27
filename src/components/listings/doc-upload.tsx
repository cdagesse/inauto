"use client";

import { upload } from "@vercel/blob/client";
import { useUser } from "@clerk/nextjs";
import { useId, useState } from "react";

/**
 * One-file upload for purchase evidence (a title photo or a proof-of-ownership
 * video). Uploads straight to Vercel Blob under purchases/{clerkId}/ through
 * the same token broker as listing photos.
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
  onChange: (url: string | undefined) => void;
  slot: string;
}) {
  const { user } = useUser();
  const id = useId();
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!user) return setError("Sign in to upload.");
    if (file.size > 200 * 1024 * 1024) return setError("Larger than 200 MB.");
    try {
      const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-60) || "file";
      const blob = await upload(`purchases/${user.id}/${slot}-${safe}`, file, {
        access: "public",
        handleUploadUrl: "/api/upload",
        onUploadProgress: ({ percentage }) => setPct(Math.round(percentage)),
      });
      setPct(null);
      onChange(blob.url);
    } catch (e) {
      setPct(null);
      setError(e instanceof Error ? e.message : "Upload failed.");
    }
  }
  const isVideo = value ? /\.(mp4|mov|webm)(\?|$)/i.test(value) : false;
  return (
    <div className="fld doc-upload">
      <label htmlFor={id}>{label}</label>
      {value ? (
        <div className="doc-preview">
          {isVideo ? (
            <video src={value} controls preload="metadata" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={value} alt={label} />
          )}
          <button type="button" className="btn sm" onClick={() => onChange(undefined)}>
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
