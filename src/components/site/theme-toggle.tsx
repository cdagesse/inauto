"use client";

import { useSyncExternalStore } from "react";

function subscribe(cb: () => void) {
  const mo = new MutationObserver(cb);
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => mo.disconnect();
}
const isLight = () => document.documentElement.getAttribute("data-theme") === "light";

export function ThemeToggle() {
  const light = useSyncExternalStore(subscribe, isLight, () => false);
  function toggle() {
    const next = !light;
    if (next) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("inauto-theme", next ? "light" : "dark");
    } catch {}
  }
  return (
    <button
      type="button"
      className="btn sm"
      onClick={toggle}
      aria-label="Toggle light and dark theme"
    >
      {light ? "Dark" : "Light"}
    </button>
  );
}
