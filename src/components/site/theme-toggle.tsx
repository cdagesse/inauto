"use client";

import { useEffect, useState } from "react";

export function ThemeToggle() {
  const [light, setLight] = useState(false);
  useEffect(() => {
    setLight(document.documentElement.getAttribute("data-theme") === "light");
  }, []);
  function toggle() {
    const next = !light;
    setLight(next);
    if (next) document.documentElement.setAttribute("data-theme", "light");
    else document.documentElement.removeAttribute("data-theme");
    try {
      localStorage.setItem("inauto-theme", next ? "light" : "dark");
    } catch {}
  }
  return (
    <button type="button" className="btn sm" onClick={toggle} aria-label="Toggle light and dark theme">
      {light ? "Dark" : "Light"}
    </button>
  );
}
