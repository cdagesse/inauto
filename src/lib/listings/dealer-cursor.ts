/**
 * Keyset cursor for the dealer inventory feed: days on market ascending (freshest at the
 * dealer first) then id. Base64url of "<daysOnMarket or empty>|<id>".
 */
export interface DealerCursor {
  daysOnMarket: number | null;
  id: string;
}

export function encodeDealerCursor(row: DealerCursor): string {
  const raw = `${row.daysOnMarket == null ? "" : row.daysOnMarket}|${row.id}`;
  return Buffer.from(raw, "utf8").toString("base64url");
}

export function decodeDealerCursor(c: string | undefined | null): DealerCursor | null {
  if (!c || c.length > 160) return null;
  let raw: string;
  try {
    raw = Buffer.from(c, "base64url").toString("utf8");
  } catch {
    return null;
  }
  const i = raw.indexOf("|");
  if (i === -1) return null;
  const dom = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  if (dom === "") return { daysOnMarket: null, id };
  const n = Number(dom);
  return Number.isInteger(n) && n >= 0 ? { daysOnMarket: n, id } : null;
}

/** "2019 Porsche 911 GT3 RS" from the parts we have; the model's short name when set. */
export function dealerTitle(l: {
  year: number | null;
  make: string;
  model: string;
  modelShort?: string | null;
  trim: string | null;
}): string {
  const model = l.modelShort ?? l.model;
  const trim = l.trim?.trim();
  // Skip a trim that only repeats the model name (Visor often lists the model as the trim).
  const trimPart = trim && trim.toLowerCase() !== model.toLowerCase() ? trim : null;
  return [l.year, l.make, model, trimPart].filter(Boolean).join(" ");
}
