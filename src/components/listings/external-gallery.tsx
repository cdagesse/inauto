"use client";

import { useState, type ReactNode } from "react";

/**
 * Up to seven platform or dealer photos, first one large. A photo whose host refuses
 * or has removed the file drops out; when none are left the placeholder takes the space,
 * the same one shown when the listing arrived without photos.
 */
export function ExternalGallery({
  photos: all,
  title,
  placeholder,
}: {
  photos: string[];
  title: string;
  placeholder: ReactNode;
}) {
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());
  const photos = all.filter((u) => !failed.has(u));
  if (!photos.length) return <>{placeholder}</>;
  return (
    <div className="gallery">
      {photos.slice(0, 7).map((u, i) => (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          key={u}
          src={u}
          alt={i === 0 ? title : ""}
          className={i === 0 ? "big" : undefined}
          loading={i === 0 ? "eager" : "lazy"}
          onError={() => setFailed((s) => new Set(s).add(u))}
        />
      ))}
    </div>
  );
}
