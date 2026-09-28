"use client";

import { useEffect, useState } from "react";
import { Pic } from "./card-photo";

/** Cover image plus thumbnails; click opens a keyboard-navigable viewer. */
export function PhotoGallery({ photos: all, title }: { photos: string[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
  // Photos whose host refused or removed the file drop out rather than showing a broken tile.
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const photos = all.filter((p) => !failed.has(p));
  const fail = (p: string) => setFailed((s) => new Set(s).add(p));
  const n = photos.length;

  useEffect(() => {
    if (open == null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i == null ? i : (i + 1) % n));
      if (e.key === "ArrowLeft") setOpen((i) => (i == null ? i : (i - 1 + n) % n));
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [open, n]);

  if (n === 0) {
    return (
      <div className="gallery">
        <div className="photo big">
          <span className="lab">{all.length ? "Photos unavailable" : "No photos yet"}</span>
        </div>
      </div>
    );
  }
  const cur = open == null ? null : Math.min(open, n - 1);
  return (
    <>
      <div className="gallery">
        <button
          type="button"
          className="photo-btn big"
          onClick={() => setOpen(0)}
          aria-label={`Open photo 1 of ${n}`}
        >
          <Pic
            src={photos[0]}
            alt={`${title} photo 1`}
            priority
            sizes="(max-width: 900px) 100vw, 760px"
            onError={() => fail(photos[0])}
          />
        </button>
        {photos.slice(1, 7).map((p, i) => (
          <button
            type="button"
            key={p}
            className="photo-btn"
            onClick={() => setOpen(i + 1)}
            aria-label={`Open photo ${i + 2} of ${n}`}
          >
            <Pic
              src={p}
              alt={`${title} photo ${i + 2}`}
              sizes="(max-width: 900px) 33vw, 250px"
              onError={() => fail(p)}
            />
            {i === 5 && n > 7 ? <span className="more">+{n - 7}</span> : null}
          </button>
        ))}
      </div>
      {cur != null ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${cur + 1} of ${n}`}
          onClick={() => setOpen(null)}
        >
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <Pic
              src={photos[cur]}
              alt={`${title} photo ${cur + 1}`}
              sizes="100vw"
              contain
              onError={() => fail(photos[cur])}
            />
            <div className="lightbox-bar">
              <button
                type="button"
                className="btn sm"
                onClick={() => setOpen((cur - 1 + n) % n)}
                aria-label="Previous photo"
              >
                ←
              </button>
              <span className="mono">
                {cur + 1} / {n}
              </span>
              <button
                type="button"
                className="btn sm"
                onClick={() => setOpen((cur + 1) % n)}
                aria-label="Next photo"
              >
                →
              </button>
              <button type="button" className="btn sm" onClick={() => setOpen(null)} autoFocus>
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
