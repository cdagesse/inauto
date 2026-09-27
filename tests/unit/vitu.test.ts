import { describe, expect, it } from "vitest";
import { getVituToken, parseTitleReport, VituError } from "@/lib/sources/vitu";

describe("parseTitleReport", () => {
  it("reads brands, theft, liens and the latest title record from an NMVTIS-style body", () => {
    const raw = {
      vin: "WP0AA2996XS620000",
      vehicle: { make: "Porsche" },
      brands: [{ brandName: "Salvage", date: "2019-03-01" }, { brandName: "Rebuilt" }],
      theftRecords: [{ reportedDate: "2018-01-01", recovered: true }],
      liens: [{ lienholderName: "First Bank" }],
      titleRecords: [
        { titleState: "NY", odometer: { reading: 61000, unit: "MI" }, issueDate: "2024-02-01" },
        { titleState: "NJ", odometer: { reading: 40000 }, issueDate: "2020-05-01" },
      ],
    };
    const s = parseTitleReport(raw, "WP0AA2996XS620000", new Date("2026-09-27T00:00:00Z"));
    expect(s.brands).toEqual(["Salvage", "Rebuilt"]);
    expect(s.theft).toBe(true);
    expect(s.liens).toBe(1);
    expect(s.lienHolders).toEqual(["First Bank"]);
    expect(s.titleRecords).toBe(2);
    expect(s.lastTitleState).toBe("NY");
    expect(s.lastOdometer).toBe(61000);
    expect(s.verdict).toBe("issues");
    expect(s.flags).toEqual([
      "Title brand: Salvage",
      "Title brand: Rebuilt",
      "Reported stolen",
      "1 lien on record (First Bank)",
    ]);
  });
  it("is clean when records exist without flags, and unknown when the body has nothing we recognise", () => {
    const clean = parseTitleReport(
      {
        titleRecords: [{ state: "MA", mileage: "12,345" }],
        brands: [],
        stolen: false,
        lienCount: 0,
      },
      "X",
    );
    expect(clean.verdict).toBe("clean");
    expect(clean.lastOdometer).toBe(12345);
    expect(clean.flags).toEqual([]);
    expect(parseTitleReport({ hello: "world" }, "X").verdict).toBe("unknown");
  });
});

describe("getVituToken", () => {
  const cfg = {
    clientId: "id",
    clientSecret: "secret",
    scope: "oneapi:access",
    authUrl: "https://auth.test.vitu.com/realms/api/protocol/openid-connect/token",
    apiBase: "https://api-test.vitu.com",
    titlePath: "/x",
    titleMethod: "POST" as const,
  };
  it("posts form-encoded client credentials with the scope and caches the token", async () => {
    let calls = 0;
    let body = "";
    const fetchImpl = (async (_url: string | URL | Request, init?: RequestInit) => {
      calls++;
      body = String(init?.body);
      return new Response(JSON.stringify({ access_token: "tok", expires_in: 300 }), {
        status: 200,
      });
    }) as unknown as typeof fetch;
    const t1 = await getVituToken({ ...cfg, fetchImpl }, 1_000);
    const t2 = await getVituToken({ ...cfg, fetchImpl }, 2_000);
    expect(t1).toBe("tok");
    expect(t2).toBe("tok");
    expect(calls).toBe(1);
    const p = new URLSearchParams(body);
    expect(p.get("grant_type")).toBe("client_credentials");
    expect(p.get("client_id")).toBe("id");
    expect(p.get("scope")).toBe("oneapi:access");
  });
  it("surfaces an invalid_client as a token error", async () => {
    const fetchImpl = (async () =>
      new Response(JSON.stringify({ error: "invalid_client" }), {
        status: 401,
      })) as unknown as typeof fetch;
    await expect(
      getVituToken({ ...cfg, clientId: "other", fetchImpl }, 5_000),
    ).rejects.toBeInstanceOf(VituError);
  });
});
