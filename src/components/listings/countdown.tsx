"use client";

import { useEffect, useState } from "react";
import { timeLeft } from "./listing-card";

/**
 * Live "time left" text. Ticks every second inside the last hour (so the
 * seconds count down), every 30 seconds before that, and settles on "Ended".
 * The server and client render different instants, so hydration is allowed
 * to patch the text rather than warn.
 */
export function Countdown({ endsAt }: { endsAt: string | Date }) {
  const end = typeof endsAt === "string" ? new Date(endsAt) : endsAt;
  const [text, setText] = useState(() => timeLeft(end));
  useEffect(() => {
    const endMs = end.getTime();
    let id: ReturnType<typeof setTimeout> | null = null;
    const tick = () => {
      setText(timeLeft(end));
      const remaining = endMs - Date.now();
      if (remaining <= 0) return;
      id = setTimeout(tick, remaining < 3_600_000 ? 1_000 : 30_000);
    };
    tick();
    return () => {
      if (id) clearTimeout(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [end.getTime()]);
  return <span suppressHydrationWarning>{text}</span>;
}
