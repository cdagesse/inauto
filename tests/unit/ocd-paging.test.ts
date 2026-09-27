import { describe, expect, it } from "vitest";
import { createOcdClient } from "@/lib/sources/ocd";

const recorder = { reserve: async () => {}, record: async () => {} };

function liveRow(i: number) {
  return {
    id: i,
    url: `https://bringatrailer.com/listing/x-${i}`,
    source: "Bring a Trailer",
    title: `Car ${i}`,
    auction_end_at: "2026-09-28T17:00:00Z",
    auction_status: "active",
  };
}

describe("Old Cars Data paging", () => {
  it("walks every page of /auctions/live using total_pages when has_more is absent", async () => {
    const pages: number[] = [];
    const fetchImpl: typeof fetch = async (input) => {
      const u = new URL(String(input));
      const page = Number(u.searchParams.get("page") ?? 1);
      pages.push(page);
      const data = page <= 3 ? Array.from({ length: 100 }, (_, i) => liveRow(page * 1000 + i)) : [];
      return new Response(
        JSON.stringify({ data, meta: { page, limit: 100, total: 300, total_pages: 3 } }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const client = createOcdClient({ apiKey: "k", record: recorder, fetchImpl });
    const rows = await client.live({}, new Date("2026-09-27T00:00:00Z"));
    expect(pages).toEqual([1, 2, 3]);
    expect(rows).toHaveLength(300);
  });
  it("stops a cursor walk when has_more is false", async () => {
    let calls = 0;
    const fetchImpl: typeof fetch = async () => {
      calls++;
      return new Response(
        JSON.stringify({
          data: [{ ...liveRow(1), auction_status: "sold", price: 10000 }],
          meta: { has_more: false, next_cursor: null },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    };
    const client = createOcdClient({ apiKey: "k", record: recorder, fetchImpl });
    const rows = await client.auctions({ make: "Porsche" }, null);
    expect(calls).toBe(2); // one page per status (sold, reserve not met)
    expect(rows).toHaveLength(1);
  });
});
