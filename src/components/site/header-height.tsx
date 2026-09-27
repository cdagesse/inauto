"use client";

import { useEffect } from "react";

/** Publishes the site header's height as --site-head-h so sticky elements can sit under it. */
export function HeaderHeight() {
  useEffect(() => {
    const el = document.querySelector<HTMLElement>("header.site-head");
    if (!el) return;
    const set = () =>
      document.documentElement.style.setProperty(
        "--site-head-h",
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    set();
    const ro = new ResizeObserver(set);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return null;
}
