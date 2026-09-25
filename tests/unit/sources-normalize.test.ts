import { describe, expect, it } from "vitest";
import { createOcdClient, normalizeOcdRow, normalizeOcdStatus } from "@/lib/sources/ocd";
import { createVisorClient, normalizeVisorRow } from "@/lib/sources/visor";
import type { CallRecorder, SourceCallMeta } from "@/lib/sources/types";

const visorFixture = {
  data: [
    {
      id: "v-1",
      vin: "WP0AF2A9XRS000001",
      year: 2025,
      make: "Porsche",
      model: "911",
      trim: "GT3 RS Weissach",
      mileage: "1,500",
      price: 486500,
      exterior_color: "Shark Blue",
      dealer_name: "Example Motors",
      state: "CA",
      days_on_market: 16,
      sold_at: "2026-09-18T15:00:00Z",
    },
    {
      id: "v-2",
      year: 2019,
      make: "Porsche",
      model: "911",
      trim: "GT3 RS",
      miles: 11541,
      price: "$267,995",
      state: "FL",
    },
    { vin: "no id row" },
  ],
  page: 1,
  total_pages: 1,
};

const ocdFixture = {
  data: [
    {
      id: 90210,
      platform: "Bring a Trailer",
      url: "https://bringatrailer.com/listing/x",
      year: 2016,
      make: "Porsche",
      model: "911 GT3 RS",
      title: "2016 Porsche 911 GT3 RS",
      mileage: 86,
      hammer_price: 280000,
      status: "sold",
      ended_at: "2026-07-13",
    },
    {
      id: "rnm-1",
      source: "Hagerty Marketplace",
      year: 2007,
      title: "2007 Porsche 911 GT3 RS",
      miles: 18700,
      high_bid: 186000,
      status: "Reserve Not Met",
      end_date: "2026-03-11T00:00:00Z",
    },
  ],
};

function recorder() {
  const metas: SourceCallMeta[] = [];
  const reserved: string[] = [];
  const rec: CallRecorder = {
    reserve: async (e) => {
      reserved.push(e);
    },
    record: async (m) => {
      metas.push(m);
    },
  };
  return { rec, metas, reserved };
}
const fetchWith = (body: unknown) =>
  (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { "x-ratelimit-remaining": "9" },
    })) as typeof fetch;

describe("visor normalization", () => {
  it("maps fields tolerantly and drops rows without an id", () => {
    const rows = visorFixture.data.map(normalizeVisorRow);
    expect(rows[2]).toBeNull();
    expect(rows[0]).toMatchObject({
      sourceListingId: "v-1",
      year: 2025,
      miles: 1500,
      price: 486500,
      color: "Shark Blue",
      state: "CA",
      daysOnMarket: 16,
      soldDate: "2026-09-18",
      rawTrim: "GT3 RS Weissach",
    });
    expect(rows[1]).toMatchObject({
      sourceListingId: "v-2",
      miles: 11541,
      price: 267995,
      soldDate: null,
    });
  });

  it("client reserves budget before each call and records the raw response", async () => {
    const { rec, metas, reserved } = recorder();
    const client = createVisorClient({
      apiKey: "k",
      record: rec,
      fetchImpl: fetchWith(visorFixture),
    });
    const rows = await client.sold({ make: "Porsche", model: "911", trim: "GT3 RS" }, 2);
    expect(rows.length).toBe(2);
    expect(reserved).toEqual(["/v1/listings/sold"]);
    expect(metas[0]).toMatchObject({ endpoint: "/v1/listings/sold", status: 200, rowCount: 3 });
    expect(metas[0].rateLimit["x-ratelimit-remaining"]).toBe("9");
    expect(JSON.stringify(metas[0].params)).not.toContain('"k"');
  });
});

describe("ocd normalization", () => {
  it("maps statuses", () => {
    expect(normalizeOcdStatus("sold")).toBe("sold");
    expect(normalizeOcdStatus("Reserve Not Met")).toBe("rnm");
    expect(normalizeOcdStatus("withdrawn")).toBe("withdrawn");
    expect(normalizeOcdStatus(undefined)).toBe("rnm");
  });

  it("uses hammer price for sold rows and high bid for rnm rows", () => {
    const [sold, rnm] = ocdFixture.data.map(normalizeOcdRow);
    expect(sold).toMatchObject({
      source: "Bring a Trailer",
      sourceId: "90210",
      hammerPrice: 280000,
      status: "sold",
      miles: 86,
    });
    expect(sold?.endedAt?.slice(0, 10)).toBe("2026-07-13");
    expect(rnm).toMatchObject({
      source: "Hagerty Marketplace",
      sourceId: "rnm-1",
      hammerPrice: 186000,
      status: "rnm",
    });
  });

  it("client sends bearer auth and records once per page", async () => {
    const { rec, metas, reserved } = recorder();
    let seenAuth = "";
    const fetchImpl = (async (_u: string | URL | Request, init?: RequestInit) => {
      seenAuth = (init?.headers as Record<string, string>).Authorization;
      return new Response(JSON.stringify(ocdFixture), { status: 200 });
    }) as typeof fetch;
    const client = createOcdClient({ apiKey: "sekret", record: rec, fetchImpl });
    const rows = await client.auctions(
      { make: "Porsche", model: "911 GT3 RS" },
      "2025-12-01T00:00:00Z",
    );
    expect(rows.length).toBe(2);
    expect(seenAuth).toBe("Bearer sekret");
    expect(reserved).toEqual(["/auctions"]);
    expect(metas.length).toBe(1);
  });

  it("stops when the budget hook throws, before any request", async () => {
    let fetched = 0;
    const fetchImpl = (async () => {
      fetched++;
      return new Response("{}", { status: 200 });
    }) as typeof fetch;
    const rec: CallRecorder = {
      reserve: async () => {
        throw new Error("BudgetExceeded");
      },
      record: async () => {},
    };
    const client = createOcdClient({ apiKey: "k", record: rec, fetchImpl });
    await expect(client.makes()).rejects.toThrow("BudgetExceeded");
    expect(fetched).toBe(0);
  });
});
