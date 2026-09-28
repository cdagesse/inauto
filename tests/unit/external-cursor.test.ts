import { describe, expect, it } from "vitest";
import { decodeExternalCursor, encodeExternalCursor } from "@/lib/listings/external-cursor";

const id = "0b3f7d2e-9c1a-4f6b-8e2d-1a2b3c4d5e6f";

describe("external feed cursor", () => {
  it("round-trips a dated live row", () => {
    const endsAt = new Date("2026-09-25T12:00:00.000Z");
    const c = encodeExternalCursor("live", { endsAt, id });
    expect(decodeExternalCursor(c)).toEqual({ phase: "live", endsAt, id });
  });

  it("round-trips a row without an end time in either phase", () => {
    expect(decodeExternalCursor(encodeExternalCursor("live", { endsAt: null, id }))).toEqual({
      phase: "live",
      endsAt: null,
      id,
    });
    expect(decodeExternalCursor(encodeExternalCursor("past", { endsAt: null, id }))).toEqual({
      phase: "past",
      endsAt: null,
      id,
    });
  });

  it("rejects unknown phases, malformed ids, bad dates and garbage", () => {
    const enc = (s: string) => Buffer.from(s).toString("base64url");
    expect(decodeExternalCursor(undefined)).toBeNull();
    expect(decodeExternalCursor("")).toBeNull();
    expect(decodeExternalCursor("%%%")).toBeNull();
    expect(decodeExternalCursor(enc(`done|null|${id}`))).toBeNull();
    expect(decodeExternalCursor(enc(`live|null|not-a-uuid`))).toBeNull();
    expect(decodeExternalCursor(enc(`live|null`))).toBeNull();
    expect(decodeExternalCursor(enc(`live|yesterday|${id}`))).toBeNull();
  });
});
