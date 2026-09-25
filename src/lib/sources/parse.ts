/** Small tolerant parsers shared by the normalizers. */

export function toInt(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? Math.round(v) : null;
  if (typeof v === "string") {
    const n = Number(v.replace(/[^0-9.\-]/g, ""));
    return Number.isFinite(n) && v.trim() !== "" ? Math.round(n) : null;
  }
  return null;
}

export function toStr(v: unknown): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

export function toDateOnly(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

export function toIso(v: unknown): string | null {
  const s = toStr(v);
  if (!s) return null;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export function pick(obj: unknown, ...keys: string[]): unknown {
  if (!obj || typeof obj !== "object") return undefined;
  const o = obj as Record<string, unknown>;
  for (const k of keys) if (o[k] !== undefined) return o[k];
  return undefined;
}
