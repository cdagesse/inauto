import { PLATFORMS, type PlatformKey } from "@/lib/sources/platforms";

/** "Live on Bring a Trailer" style badge that names the platform hosting a listing. */
export function SourceBadge({
  source,
  sourceName,
  status,
  size = "sm",
  compact = false,
}: {
  source: PlatformKey;
  sourceName?: string;
  status: "live" | "sold" | "rnm" | "withdrawn" | "ended";
  size?: "sm" | "lg";
  /** Cards: platform name only; the card's meta row carries the state (time left, Sold…). */
  compact?: boolean;
}) {
  const p = PLATFORMS[source] ?? PLATFORMS.other;
  const name = source === "other" && sourceName ? sourceName : p.name;
  const verb =
    status === "live"
      ? "Live on"
      : status === "sold"
        ? "Sold on"
        : status === "rnm"
          ? "Not sold on"
          : status === "withdrawn"
            ? "Withdrawn from"
            : "Ended on";
  return (
    <span
      className={`source-badge ${size} ${status === "live" ? "is-live" : ""}`}
      style={{ ["--badge" as string]: `var(--${p.colorToken})` }}
    >
      <i aria-hidden="true" />
      {compact ? name : `${verb} ${name}`}
    </span>
  );
}

export function PlatformMark({ source }: { source: PlatformKey }) {
  const p = PLATFORMS[source] ?? PLATFORMS.other;
  const initials = p.name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .slice(0, 3)
    .toUpperCase();
  return (
    <span
      className="platform-mark"
      style={{ ["--badge" as string]: `var(--${p.colorToken})` }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
