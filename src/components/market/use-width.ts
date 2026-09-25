"use client";

import { useEffect, useRef, useState } from "react";

/** Measured content width of a box, updated by ResizeObserver. */
export function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [w, setW] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => {
      const cw = entries[0]?.contentRect.width;
      if (cw) setW(Math.round(cw));
    });
    ro.observe(el);
    setW(el.clientWidth || fallback);
    return () => ro.disconnect();
  }, [fallback]);
  return [ref, w] as const;
}
