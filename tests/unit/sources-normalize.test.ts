import { describe, expect, it } from "vitest";
import {
  createOcdClient,
  encodeOcdKeyword,
  matchOcdRules,
  normalizeOcdRow,
  normalizeOcdStatus,
  ocdRowMatches,
  parseOcdAlias,
} from "@/lib/sources/ocd";
import {
  createVisorClient,
  normalizeVisorRow,
  patternToRegExp,
  selectTrims,
} from "@/lib/sources/visor";
import type { CallRecorder, SourceCallMeta } from "@/lib/sources/types";

/* ---------- fixtures shaped like the real APIs ---------- */

const visorPage1 = {
  data: [
    {
      id: "lst_01HZX",
      vin: "WP0AF2A9XRS000001",
      year: 2025,
      make: "Porsche",
      model: "911",
      trim: "GT3 RS Weissach",
      version: "Coupe",
      body_type: "Coupe",
      price: 486500,
      miles: 1500,
      status: "sold",
      inventory_status: "sold",
      exterior_color: "Shark Blue",
      interior_color: "Black",
      dealer_id: "dlr_1",
      dealer_name: "Example Motors",
      state: "CA",
      days_on_market: 16,
      listed_at: "2026-09-02T15:00:00Z",
      sold_date: "2026-09-18",
      last_checked_at: "2026-09-18T15:00:00Z",
      city: "Irvine",
      postal_code: "92618",
      vdp_url: "https://dealer.example/vdp/1",
      stock_number: "P1234",
      photo_urls: ["https://img.example/1.jpg"],
      options_packages: ["Weissach Package", "Front Axle Lift"],
    },
    {
      id: "lst_02",
      vin: "WP0AF2A98KS000002",
      year: 2019,
      make: "Porsche",
      model: "911",
      trim: "GT3 RS",
      price: 267995,
      miles: 11541,
      state: "FL",
      sold_date: null,
    },
    {
      id: "lst_03",
      year: 2019,
      make: "Porsche",
      model: "911",
      trim: "Carrera S",
      price: 99000,
      miles: 20000,
      sold_date: "2026-09-17",
    },
    { vin: "no id row" },
  ],
  pagination: { limit: 100, offset: 0, total: 101, next_offset: 100 },
};
const visorPage2 = {
  data: [
    {
      id: "lst_04",
      year: 2024,
      make: "Porsche",
      model: "911",
      trim: "GT3 RS",
      price: 460000,
      miles: 900,
      sold_date: "2026-09-16",
    },
  ],
  pagination: { limit: 100, offset: 100, total: 101, next_offset: null },
};
const visorFacets = {
  data: {
    total: 412,
    facets: {
      trim: [
        { value: "Carrera S", count: 200 },
        { value: "GT3 RS", count: 120 },
        { value: "GT3 RS Weissach", count: 60 },
        { value: "GT3", count: 32 },
      ],
    },
  },
};

const ocdPage = {
  data: [
    {
      id: 90210,
      source: "Bring a Trailer",
      url: "https://bringatrailer.com/listing/2016-porsche-911-gt3-rs-113/",
      vin: "WP0AF2A93GS000001",
      seller_username: "seller1",
      year: 2016,
      listing_make: "Porsche",
      listing_model: "911 GT3 RS",
      ocd_make_name: "Porsche",
      ocd_model_name: "911",
      title: "86-Mile 2016 Porsche 911 GT3 RS",
      mileage: 86,
      mileage_unit: "mi",
      exterior_color: "Lava Orange",
      auction_status: "sold",
      has_reserve: true,
      auction_end_at: "2026-07-13T18:05:00Z",
      auction_end_precision: "exact",
      price: 280000,
      currency: "USD",
      city: "Austin",
      state: "TX",
      stats: { views: 10000, watches: 400, likes: 50, bids: 21, unique_bidder_count: 9 },
      featured_image_url: "https://cdn.example/a.jpg",
      seller_type: "private",
    },
    {
      id: 90211,
      source: "Hagerty Marketplace",
      url: "https://www.hagerty.com/marketplace/auction/2007-Porsche-911/x",
      year: 2007,
      ocd_make_name: "Porsche",
      ocd_model_name: "911",
      title: "2007 Porsche 911 GT3 RS",
      mileage: 30093,
      mileage_unit: "km",
      auction_status: "reserve not met",
      auction_end_at: "2026-03-11T00:00:00Z",
      price: 186000,
      currency: "USD",
    },
    {
      id: 90212,
      source: "Collecting Cars",
      url: "https://collectingcars.com/for-sale/x",
      year: 2019,
      ocd_make_name: "Porsche",
      ocd_model_name: "911",
      title: "2019 Porsche 911 GT3 RS",
      mileage: 5000,
      auction_status: "result unavailable",
      auction_end_at: "2026-05-01T00:00:00Z",
      price: 210000,
      currency: "GBP",
    },
    {
      id: 90213,
      source: "Bring a Trailer",
      url: "https://bringatrailer.com/listing/live-one/",
      year: 2024,
      ocd_make_name: "Porsche",
      ocd_model_name: "911",
      title: "2024 Porsche 911 GT3 RS Weissach",
      auction_status: "active",
      auction_end_at: "2099-01-01T00:00:00Z",
      price: 400000,
    },
    {
      id: 90214,
      source: "Bring a Trailer",
      url: "https://bringatrailer.com/listing/gt3-touring/",
      year: 2022,
      ocd_make_name: "Porsche",
      ocd_model_name: "911",
      title: "2022 Porsche 911 GT3 Touring",
      auction_status: "sold",
      auction_end_at: "2026-06-01T00:00:00Z",
      price: 230000,
    },
  ],
  meta: { pagination: "cursor", has_more: false, next_cursor: null },
};

function recorder() {
  const metas: SourceCallMeta[] = [];
  const reserved: { endpoint: string; free: boolean }[] = [];
  const rec: CallRecorder = {
    reserve: async (e, o) => {
      reserved.push({ endpoint: e, free: !!o?.free });
    },
    record: async (m) => {
      metas.push(m);
    },
  };
  return { rec, metas, reserved };
}
/** Route requests by path (+ offset) to fixture bodies and capture every URL. */
function router(routes: Record<string, unknown>, status = 200) {
  const urls: string[] = [];
  const inits: RequestInit[] = [];
  const impl = (async (u: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(u));
    urls.push(url.toString());
    inits.push(init ?? {});
    const key = `${url.pathname}${url.searchParams.get("offset") ? `?offset=${url.searchParams.get("offset")}` : ""}`;
    const body = routes[key] ?? routes[url.pathname];
    if (body === undefined)
      return new Response(JSON.stringify({ error: "not found" }), { status: 404 });
    return new Response(JSON.stringify(body), {
      status,
      headers: { "x-ratelimit-remaining": "9", "x-visor-usage-units": "1" },
    });
  }) as typeof fetch;
  return { impl, urls, inits };
}

/* ---------- Visor ---------- */

describe("visor normalization", () => {
  it("maps the real field names and drops rows without an id", () => {
    const rows = visorPage1.data.map(normalizeVisorRow);
    expect(rows[3]).toBeNull();
    expect(rows[0]).toMatchObject({
      sourceListingId: "lst_01HZX",
      vin: "WP0AF2A9XRS000001",
      year: 2025,
      miles: 1500,
      price: 486500,
      color: "Shark Blue",
      dealerName: "Example Motors",
      state: "CA",
      daysOnMarket: 16,
      soldDate: "2026-09-18",
      rawTrim: "GT3 RS Weissach",
      optionsText: "Weissach Package Front Axle Lift",
    });
    expect(rows[1]).toMatchObject({ sourceListingId: "lst_02", soldDate: null, optionsText: null });
  });

  it("turns an ILIKE pattern into a regexp and selects matching facet trims by count", () => {
    expect(patternToRegExp("%GT3 RS%").test(normalizeTrim("GT3 RS Weissach"))).toBe(true);
    expect(patternToRegExp("%GT3 RS%").test(normalizeTrim("GT3 Touring"))).toBe(false);
    expect(selectTrims(visorFacets, "%GT3 RS%")).toEqual(["GT3 RS", "GT3 RS Weissach"]);
    expect(selectTrims({}, "%x%")).toEqual([]);
  });

  it("sold pull: bearer auth, facets first, exact trims, sold params, offset paging, client-side filter", async () => {
    const { rec, metas, reserved } = recorder();
    const { impl, urls, inits } = router({
      "/v1/facets": visorFacets,
      "/v1/listings": visorPage1,
      "/v1/listings?offset=100": visorPage2,
    });
    const client = createVisorClient({ apiKey: "sk_live_x", record: rec, fetchImpl: impl });
    const rows = await client.sold(
      { make: "Porsche", model: "911", trimPattern: "%GT3 RS%", years: [2023, 2024, 2025, 2026] },
      2,
    );
    // Carrera S (lst_03) filtered out client-side; lst_02 has no sold_date but is kept (cleaner decides).
    expect(rows.map((r) => r.sourceListingId)).toEqual(["lst_01HZX", "lst_02", "lst_04"]);
    expect(reserved.map((r) => r.endpoint)).toEqual(["/v1/facets", "/v1/listings", "/v1/listings"]);
    expect(reserved.every((r) => !r.free)).toBe(true);
    for (const init of inits)
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sk_live_x");
    const facets = new URL(urls[0]);
    expect(facets.searchParams.get("facets")).toBe("trim");
    expect(facets.searchParams.get("inventory_status")).toBe("sold");
    const first = new URL(urls[1]);
    expect(first.searchParams.get("inventory_status")).toBe("sold");
    expect(first.searchParams.get("sold_within_days")).toBe("2");
    expect(first.searchParams.get("limit")).toBe("100");
    expect(first.searchParams.get("offset")).toBe("0");
    expect(first.searchParams.get("trim")).toBe("GT3 RS,GT3 RS Weissach");
    expect(first.searchParams.get("year")).toBe("2023,2024,2025,2026");
    expect(first.searchParams.get("fields")).toContain("options_packages");
    for (const k of [...first.searchParams.keys()])
      expect([
        "make",
        "model",
        "inventory_status",
        "sold_within_days",
        "limit",
        "offset",
        "trim",
        "year",
        "fields",
      ]).toContain(k);
    expect(new URL(urls[2]).searchParams.get("offset")).toBe("100");
    expect(metas[1]).toMatchObject({ endpoint: "/v1/listings", status: 200, rowCount: 4 });
    expect(metas[1].rateLimit["x-visor-usage-units"]).toBe("1");
    expect(JSON.stringify(metas[1].params)).not.toContain("sk_live");
  });

  it("active pull omits inventory_status and falls back to client-side filtering when facets fail", async () => {
    const { rec } = recorder();
    const { impl, urls } = router({
      "/v1/listings": { ...visorPage1, pagination: { next_offset: null } },
    });
    const client = createVisorClient({ apiKey: "k", record: rec, fetchImpl: impl });
    const rows = await client.active({ make: "Porsche", model: "911", trimPattern: "%GT3 RS%" });
    expect(rows.map((r) => r.sourceListingId)).toEqual(["lst_01HZX", "lst_02"]);
    const listing = new URL(urls[1]);
    expect(listing.searchParams.has("inventory_status")).toBe(false);
    expect(listing.searchParams.has("trim")).toBe(false);
  });

  it("surfaces a 403 with a key-free message", async () => {
    const { rec } = recorder();
    const { impl } = router(
      { "/v1/listings": { error: { message: "invalid api key sk_live_secret" } } },
      403,
    );
    const client = createVisorClient({ apiKey: "sk_live_secret", record: rec, fetchImpl: impl });
    await expect(client.active({ make: "Porsche", model: "911" })).rejects.toThrow(
      "Visor /v1/listings returned 403",
    );
  });
});

/* ---------- Old Cars Data ---------- */

describe("ocd alias encoding", () => {
  it("round-trips keyword and exclude", () => {
    expect(encodeOcdKeyword("GT3", "RS")).toBe("GT3 !~ RS");
    expect(encodeOcdKeyword(null, null)).toBeNull();
    expect(
      parseOcdAlias({ rawMake: "Porsche", rawModel: "911", rawTrimPattern: "GT3 !~ RS" }),
    ).toEqual({
      make: "Porsche",
      model: "911",
      keyword: "GT3",
      excludeKeyword: "RS",
    });
    expect(
      parseOcdAlias({ rawMake: "Bugatti", rawModel: "", rawTrimPattern: "Chiron" }),
    ).toMatchObject({
      model: "",
      keyword: "Chiron",
      excludeKeyword: null,
    });
  });

  it("matches rows by make, line, spacing-insensitive keyword, exclude word and year range", () => {
    const s63 = parseOcdAlias({
      rawMake: "Mercedes-Benz",
      rawModel: "S-Class",
      rawTrimPattern: "S63",
    });
    const row = {
      rawMake: "Mercedes-Benz",
      rawModel: "S-Class",
      title: "2015 Mercedes-Benz S 63 AMG",
      year: 2015,
    };
    expect(ocdRowMatches(s63, row)).toBe(true);
    expect(ocdRowMatches(s63, { ...row, title: "2015 Mercedes-Benz S 550" })).toBe(false);
    expect(ocdRowMatches(s63, { ...row, rawModel: "E-Class" })).toBe(false);
    expect(ocdRowMatches(s63, row, { start: 2018, end: null })).toBe(false);
    const gt3 = parseOcdAlias({ rawMake: "Porsche", rawModel: "911", rawTrimPattern: "GT3 !~ RS" });
    expect(
      ocdRowMatches(gt3, {
        rawMake: "Porsche",
        rawModel: "911",
        title: "2022 Porsche 911 GT3 Touring",
      }),
    ).toBe(true);
    expect(
      ocdRowMatches(gt3, { rawMake: "Porsche", rawModel: "911", title: "2022 Porsche 911 GT3 RS" }),
    ).toBe(false);
    const anyLine = parseOcdAlias({ rawMake: "Bugatti", rawModel: "", rawTrimPattern: "Chiron" });
    expect(
      ocdRowMatches(anyLine, {
        rawMake: "Bugatti",
        rawModel: null,
        title: "2019 Bugatti Chiron Sport",
      }),
    ).toBe(true);
  });

  it("matchOcdRules returns the first matching rule's model id", () => {
    const rules = [
      {
        modelId: "gt3rs",
        source: "ocd",
        rawMake: "Porsche",
        rawModel: "911",
        rawTrimPattern: "GT3 RS",
      },
      {
        modelId: "gt3",
        source: "ocd",
        rawMake: "Porsche",
        rawModel: "911",
        rawTrimPattern: "GT3 !~ RS",
      },
      {
        modelId: "v",
        source: "visor",
        rawMake: "Porsche",
        rawModel: "911",
        rawTrimPattern: "%GT3%",
      },
    ];
    expect(
      matchOcdRules(rules, {
        rawMake: "Porsche",
        rawModel: "911",
        title: "2019 Porsche 911 GT3 RS Weissach",
      }),
    ).toBe("gt3rs");
    expect(
      matchOcdRules(rules, { rawMake: "Porsche", rawModel: "911", title: "2018 Porsche 911 GT3" }),
    ).toBe("gt3");
    expect(
      matchOcdRules(rules, { rawMake: "Porsche", rawModel: "Cayman", title: "GT4 RS" }),
    ).toBeNull();
  });
});

describe("ocd normalization", () => {
  it("maps auction_status values", () => {
    expect(normalizeOcdStatus("sold")).toBe("sold");
    expect(normalizeOcdStatus("reserve not met")).toBe("rnm");
    expect(normalizeOcdStatus("canceled")).toBe("withdrawn");
    expect(normalizeOcdStatus("withdrawn")).toBe("withdrawn");
    expect(normalizeOcdStatus("active")).toBe("active");
    expect(normalizeOcdStatus("result unavailable")).toBe("unknown");
    expect(normalizeOcdStatus(undefined)).toBe("unknown");
  });

  it("maps real rows: price is hammer or high bid, km → miles, review flags, active dropped", () => {
    const rows = ocdPage.data.map(normalizeOcdRow);
    expect(rows[0]).toMatchObject({
      source: "Bring a Trailer",
      sourceId: "90210",
      url: "https://bringatrailer.com/listing/2016-porsche-911-gt3-rs-113/",
      vin: "WP0AF2A93GS000001",
      year: 2016,
      rawMake: "Porsche",
      rawModel: "911",
      title: "86-Mile 2016 Porsche 911 GT3 RS",
      miles: 86,
      hammerPrice: 280000,
      status: "sold",
      endedAt: "2026-07-13T18:05:00.000Z",
      needsReview: false,
    });
    expect(rows[1]).toMatchObject({
      source: "Hagerty Marketplace",
      status: "rnm",
      hammerPrice: 186000,
      miles: 18699,
    });
    expect(rows[2]).toMatchObject({ status: "rnm", needsReview: true }); // result unavailable + GBP
    expect(rows[3]).toBeNull(); // active auctions are not results
  });

  it("auctions(): bearer auth, real params, one status-scoped walk each, stops at the cursor date", async () => {
    const { rec, metas, reserved } = recorder();
    const { impl, urls, inits } = router({ "/auctions": ocdPage });
    const client = createOcdClient({ apiKey: "sekret", record: rec, fetchImpl: impl });
    const rows = await client.auctions(
      { make: "Porsche", model: "911", keyword: "GT3 RS", yearMin: 2007, yearMax: 2026 },
      "2026-04-01T00:00:00Z",
    );
    // 90211 (Mar 11) is older than `since`; 90213 is active; duplicates across the two walks are dropped.
    expect(rows.map((r) => r.sourceId).sort()).toEqual(["90210", "90212", "90214"]);
    expect(reserved.map((r) => r.endpoint)).toEqual(["/auctions", "/auctions"]);
    for (const init of inits)
      expect((init.headers as Record<string, string>).Authorization).toBe("Bearer sekret");
    const u = new URL(urls[0]);
    expect(u.searchParams.get("make")).toBe("Porsche");
    expect(u.searchParams.get("model")).toBe("911");
    expect(u.searchParams.get("keyword")).toBe("GT3 RS");
    expect(u.searchParams.get("year_min")).toBe("2007");
    expect(u.searchParams.get("status")).toBe("sold");
    expect(u.searchParams.get("pagination")).toBe("cursor");
    expect(u.searchParams.get("limit")).toBe("100");
    expect(u.searchParams.get("sort")).toBeNull(); // verified: the API rejects sort=auction_end_at
    expect(new URL(urls[1]).searchParams.get("status")).toBe("reserve not met");
    expect(metas.length).toBe(2);
  });

  it("auctions(): retries a page unsorted when the API rejects sort", async () => {
    const { rec } = recorder();
    let calls = 0;
    const impl = (async (u: string | URL) => {
      calls++;
      const url = new URL(String(u));
      if (url.searchParams.has("sort"))
        return new Response(JSON.stringify({ error: "unknown parameter sort" }), { status: 400 });
      return new Response(JSON.stringify(ocdPage), { status: 200 });
    }) as typeof fetch;
    const client = createOcdClient({ apiKey: "k", record: rec, fetchImpl: impl });
    const rows = await client.auctions({ make: "Porsche", model: "911" }, null);
    expect(rows.length).toBe(4);
    expect(calls).toBe(2); // sort is never attempted, so no wasted call (sort stays off after the first rejection)
  });

  it("live(): uses /auctions/live with page params and maps price/bids/end", async () => {
    const { rec } = recorder();
    const { impl, urls } = router({
      "/auctions/live": {
        data: [ocdPage.data[3]],
        meta: { total: 1, page: 1, limit: 100, total_pages: 1 },
      },
    });
    const client = createOcdClient({ apiKey: "k", record: rec, fetchImpl: impl });
    const rows = await client.live(
      { make: "Porsche", model: "911" },
      new Date("2026-09-25T00:00:00Z"),
    );
    expect(rows[0]).toMatchObject({
      source: "bat",
      sourceId: "90213",
      currentBid: 400000,
      status: "live",
    });
    const u = new URL(urls[0]);
    expect(u.pathname).toBe("/auctions/live");
    expect(u.searchParams.get("page")).toBe("1");
    expect(u.searchParams.get("limit")).toBe("100");
  });

  it("public /makes and /models are free and unauthenticated", async () => {
    const { rec, reserved } = recorder();
    const { impl, inits } = router({
      "/makes": { data: ["Porsche"] },
      "/models": { data: ["911"] },
    });
    const client = createOcdClient({ apiKey: "k", record: rec, fetchImpl: impl });
    expect(await client.makes()).toEqual(["Porsche"]);
    expect(await client.models("Porsche")).toEqual(["911"]);
    expect(reserved.every((r) => r.free)).toBe(true);
    for (const init of inits)
      expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
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
    await expect(client.auctions({ make: "Porsche" }, null)).rejects.toThrow("BudgetExceeded");
    expect(fetched).toBe(0);
  });
});

import { normalizeTrim, patternToRegExp as p2r, selectTrims as st } from "@/lib/sources/visor";

describe("trim matching ignores spacing and symbols", () => {
  const facets = {
    data: {
      facets: {
        trim: [
          { value: "S 580", count: 4405 },
          { value: "AMG S 63", count: 391 },
          { value: "S63 AMG®", count: 93 },
          { value: "AMG® S 63", count: 40 },
          { value: "S 63", count: 20 },
          { value: "S 560", count: 306 },
        ],
      },
    },
  };
  it("selects every S63 spelling and nothing else", () => {
    expect(st(facets, "%S63%").sort()).toEqual(
      ["AMG S 63", "AMG® S 63", "S 63", "S63 AMG®"].sort(),
    );
    expect(st(facets, "%S 63%")).toHaveLength(4);
  });
  it("row filter accepts symbol variants", () => {
    const re = p2r("%GT3 RS%");
    expect(re.test(normalizeTrim("GT3 RS Weissach"))).toBe(true);
    expect(re.test(normalizeTrim("GT3-RS"))).toBe(true);
    expect(re.test(normalizeTrim("GT3 Touring"))).toBe(false);
  });
});
