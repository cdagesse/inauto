"use client";

import { upload } from "@vercel/blob/client";
import { useUser } from "@clerk/nextjs";
import { useEffect, useId, useRef, useState } from "react";

const ACCEPT = ["image/jpeg", "image/png", "image/webp", "image/heic"];
const MAX_BYTES = 12 * 1024 * 1024;

type Pending = { key: string; name: string; pct: number; error?: string };

export function PhotoUpload({
  value,
  onChange,
  max = 24,
}: {
  value: string[];
  onChange: (urls: string[]) => void;
  max?: number;
}) {
  const { user } = useUser();
  const userId = user?.id ?? null; // Clerk id; the token broker checks the same prefix
  const inputId = useId();
  const urlId = useId();
  const [pending, setPending] = useState<Pending[]>([]);
  const [drag, setDrag] = useState(false);
  const [link, setLink] = useState("");
  const [linkError, setLinkError] = useState<string | null>(null);
  // Latest value for the async upload callbacks, which outlive a render.
  const valueRef = useRef(value);
  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  function patch(key: string, p: Partial<Pending>) {
    setPending((cur) => cur.map((x) => (x.key === key ? { ...x, ...p } : x)));
  }

  async function addFiles(files: FileList | File[]) {
    const room = max - valueRef.current.length - pending.filter((p) => !p.error).length;
    const list = Array.from(files).slice(0, Math.max(0, room));
    if (list.length === 0) return;
    await Promise.all(
      list.map(async (file) => {
        const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        setPending((cur) => [...cur, { key, name: file.name, pct: 0 }]);
        if (!ACCEPT.includes(file.type))
          return patch(key, { error: "Use JPEG, PNG, WebP or HEIC." });
        if (file.size > MAX_BYTES) return patch(key, { error: "Larger than 12 MB." });
        try {
          const safe = file.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(-80) || "photo";
          if (!userId) throw new Error("Sign in to upload photos.");
          const blob = await upload(`listings/${userId}/${safe}`, file, {
            access: "public",
            handleUploadUrl: "/api/upload",
            onUploadProgress: ({ percentage }) => patch(key, { pct: Math.round(percentage) }),
          });
          setPending((cur) => cur.filter((x) => x.key !== key));
          onChange([...valueRef.current, blob.url]);
        } catch (e) {
          patch(key, { error: e instanceof Error ? e.message : "Upload failed." });
        }
      }),
    );
  }

  function move(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= value.length) return;
    const next = value.slice();
    [next[i], next[j]] = [next[j], next[i]];
    onChange(next);
  }

  function addLink() {
    setLinkError(null);
    try {
      const u = new URL(link.trim());
      if (u.protocol !== "https:") throw new Error("https only");
      if (value.length >= max) throw new Error(`Up to ${max} photos.`);
      onChange([...value, u.toString()]);
      setLink("");
    } catch (e) {
      setLinkError(
        e instanceof Error && e.message !== "Invalid URL"
          ? e.message
          : "Enter an https image link.",
      );
    }
  }

  const full = value.length >= max;
  return (
    <div className="photos">
      <div
        className={`dropzone${drag ? " on" : ""}`}
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          if (e.dataTransfer.files?.length) void addFiles(e.dataTransfer.files);
        }}
      >
        <label htmlFor={inputId} className="btn">
          {full ? `Up to ${max} photos` : "Choose photos"}
        </label>
        <input
          id={inputId}
          type="file"
          accept={ACCEPT.join(",")}
          multiple
          disabled={full}
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void addFiles(e.target.files);
            e.target.value = "";
          }}
        />
        <span className="hint">
          or drop them here. JPEG, PNG, WebP or HEIC up to 12 MB each. The first photo is the cover.
        </span>
      </div>

      {value.length + pending.length > 0 ? (
        <ul className="thumbs" aria-label="Photos">
          {value.map((url, i) => (
            <li key={url} className={i === 0 ? "cover" : undefined}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={url} alt={`Photo ${i + 1}`} loading="lazy" />
              {i === 0 ? <span className="pill accent">Cover</span> : null}
              <div className="thumb-actions">
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  aria-label={`Move photo ${i + 1} earlier`}
                >
                  ←
                </button>
                <button
                  type="button"
                  className="btn sm"
                  onClick={() => move(i, 1)}
                  disabled={i === value.length - 1}
                  aria-label={`Move photo ${i + 1} later`}
                >
                  →
                </button>
                <button
                  type="button"
                  className="btn sm danger"
                  onClick={() => onChange(value.filter((_, j) => j !== i))}
                  aria-label={`Remove photo ${i + 1}`}
                >
                  ✕
                </button>
              </div>
            </li>
          ))}
          {pending.map((p) => (
            <li key={p.key} className="uploading" aria-live="polite">
              <div className="thumb-progress">
                <span className="mono" style={{ fontSize: 11 }}>
                  {p.error ? p.error : `${p.name.slice(0, 22)} ${p.pct}%`}
                </span>
                {!p.error ? <i style={{ width: `${p.pct}%` }} /> : null}
              </div>
              {p.error ? (
                <div className="thumb-actions">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setPending((cur) => cur.filter((x) => x.key !== p.key))}
                  >
                    Dismiss
                  </button>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}

      <div className="fld">
        <label htmlFor={urlId}>Add by link (https)</label>
        <div style={{ display: "flex", gap: 6 }}>
          <input
            id={urlId}
            className="mono"
            value={link}
            onChange={(e) => setLink(e.target.value)}
            placeholder="https://…/photo.jpg"
            disabled={full}
          />
          <button
            type="button"
            className="btn sm"
            onClick={addLink}
            disabled={full || !link.trim()}
          >
            Add
          </button>
        </div>
        {linkError ? <span className="err">{linkError}</span> : null}
      </div>
    </div>
  );
}
