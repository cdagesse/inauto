export function StatusPill({ value }: { value: string }) {
  const tone =
    value === "active" || value === "complete" || value === "ready" || value === "sold"
      ? "up"
      : value === "blocked" || value === "declined" || value === "failed" || value === "withdrawn"
        ? "down"
        : value === "disabled" || value === "in_progress" || value === "building"
          ? "accent"
          : "";
  return <span className={`pill ${tone}`}>{value.replace("_", " ")}</span>;
}
