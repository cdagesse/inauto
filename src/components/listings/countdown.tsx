"use client";

import { useEffect, useState } from "react";
import { timeLeft } from "./listing-card";

/** Live "closes in" text that ticks once a minute and settles on "Ended" at zero. */
export function Countdown({ endsAt }: { endsAt: string }) {
  const end = new Date(endsAt);
  const [text, setText] = useState(() => timeLeft(end));
  useEffect(() => {
    const id = setInterval(() => setText(timeLeft(end)), 30_000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [endsAt]);
  return <span>{text}</span>;
}
