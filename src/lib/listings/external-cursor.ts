/**
 * Keyset cursor for the external auction feed: "<phase>|<endsAtISO|null>|<id>".
 * Live rows page by ends_at asc (nulls last), past rows by ends_at desc
 * (nulls first). The phase is encoded so a cursor from one tab is never
 * applied to the other.
 */
export type ExternalPhase = "live" | "past";

export interface ExternalCursor {
  phase: ExternalPhase;
  endsAt: Date | null;
  id: string;
}

const UUID = /^[0-9a-f-]{36}$/;

export function decodeExternalCursor(c?: string): ExternalCursor | null {
  if (!c) return null;
  try {
    const [phase, ts, id] = Buffer.from(c, "base64url").toString("utf8").split("|");
    if ((phase !== "live" && phase !== "past") || !id || !UUID.test(id)) return null;
    const d = ts === "null" ? null : new Date(ts);
    if (d && Number.isNaN(d.getTime())) return null;
    return { phase, endsAt: d, id };
  } catch {
    return null;
  }
}

export function encodeExternalCursor(
  phase: ExternalPhase,
  row: { endsAt: Date | null; id: string },
): string {
  return Buffer.from(
    `${phase}|${row.endsAt ? row.endsAt.toISOString() : "null"}|${row.id}`,
  ).toString("base64url");
}
