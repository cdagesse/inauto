/**
 * Keyset cursor for the dealer inventory feed: listing date descending (the day the car was
 * listed, derived from the snapshot day minus days on market; freshest first, unknown last)
 * then id descending. Base64url of "<YYYY-MM-DD or empty>|<id>".
 */
export interface DealerCursor {
  listedOn: string | null;
  id: string;
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function encodeDealerCursor(row: DealerCursor): string {
  return Buffer.from(`${row.listedOn ?? ""}|${row.id}`, "utf8").toString("base64url");
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
  const listedOn = raw.slice(0, i);
  const id = raw.slice(i + 1);
  if (!UUID.test(id)) return null;
  if (listedOn === "") return { listedOn: null, id };
  return DAY.test(listedOn) ? { listedOn, id } : null;
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
  // Visor often repeats the model line in the trim ("GT3", or "GT3 RS" for the GT3):
  // drop an exact repeat, and let a trim that extends the model name stand in for it.
  const lower = trim?.toLowerCase() ?? "";
  const repeats = (v: string) => lower === v.toLowerCase();
  const extends_ = (v: string) => lower.startsWith(v.toLowerCase() + " ");
  if (trim && (extends_(model) || extends_(l.model)))
    return [l.year, l.make, trim].filter(Boolean).join(" ");
  const trimPart = trim && !repeats(model) && !repeats(l.model) ? trim : null;
  return [l.year, l.make, model, trimPart].filter(Boolean).join(" ");
}
