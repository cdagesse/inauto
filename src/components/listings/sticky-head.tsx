"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Page header that pins to the top while the listing scrolls. Once the page has
 * scrolled past it, it tightens up and the car's first photo slides in on the
 * left so the reader keeps the car, title and price in view.
 */
export function StickyHead({
  photo,
  children,
}: {
  photo: string | null;
  children: React.ReactNode;
}) {
  const [stuck, setStuck] = useState(false);
  const sentinel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    const io = new IntersectionObserver(([entry]) => setStuck(!entry?.isIntersecting), {
      threshold: 0,
    });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <>
      <div ref={sentinel} className="sticky-sentinel" aria-hidden="true" />
      <div className={`page-head compact sticky-head${stuck ? " stuck" : ""}`}>
        {photo ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={photo} alt="" className="sticky-thumb" aria-hidden="true" />
        ) : null}
        {children}
      </div>
    </>
  );
}
