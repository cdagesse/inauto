"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { isBlobUrl } from "@/server/listings-schema";

/** Cover image plus thumbnails; click opens a keyboard-navigable viewer. */
export function PhotoGallery({ photos, title }: { photos: string[]; title: string }) {
  const [open, setOpen] = useState<number | null>(null);
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
          <span className="lab">No photos yet</span>
        </div>
      </div>
    );
  }
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
            <Pic src={p} alt={`${title} photo ${i + 2}`} sizes="(max-width: 900px) 33vw, 250px" />
            {i === 5 && n > 7 ? <span className="more">+{n - 7}</span> : null}
          </button>
        ))}
      </div>
      {open != null ? (
        <div
          className="lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={`Photo ${open + 1} of ${n}`}
          onClick={() => setOpen(null)}
        >
          <div className="lightbox-inner" onClick={(e) => e.stopPropagation()}>
            <Pic src={photos[open]} alt={`${title} photo ${open + 1}`} sizes="100vw" contain />
            <div className="lightbox-bar">
              <button
                type="button"
                className="btn sm"
                onClick={() => setOpen((open - 1 + n) % n)}
                aria-label="Previous photo"
              >
                ←
              </button>
              <span className="mono">
                {open + 1} / {n}
              </span>
              <button
                type="button"
                className="btn sm"
                onClick={() => setOpen((open + 1) % n)}
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

function Pic({
  src,
  alt,
  priority,
  sizes,
  contain,
}: {
  src: string;
  alt: string;
  priority?: boolean;
  sizes: string;
  contain?: boolean;
}) {
  const style = { objectFit: contain ? ("contain" as const) : ("cover" as const) };
  if (isBlobUrl(src)) {
    return <Image src={src} alt={alt} fill sizes={sizes} priority={priority} style={style} />;
  }
  // External links (paste-a-URL fallback) bypass the optimizer on purpose.
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      style={{ ...style, position: "absolute", inset: 0, width: "100%", height: "100%" }}
    />
  );
}
