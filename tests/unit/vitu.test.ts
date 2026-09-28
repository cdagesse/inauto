import { describe, expect, it } from "vitest";
import {
  createNmvtisInquiry,
  getVituToken,
  loadNmvtisRecord,
  many,
  summarizeNmvtis,
  VITU_RETRY_DELAY_MS,
  VituError,
} from "@/lib/sources/vitu";

describe("summarizeNmvtis (InquiryRecordDTO)", () => {
  const ctx = {
    vin: "WP0AA2996XS620000",
    inquiryId: 7,
    refNumber: "r",
    now: new Date("2026-09-27T00:00:00Z"),
  };
  it("reports brands, dispositions and title history, newest first", () => {
    const s = summarizeNmvtis(
      {
        vehicle: [{ vin: "WP0AA2996XS620000" }],
        title: [{ titlingState: "NY", titleIssueDate: "2024-02-01", odometerReading: "61000" }],
        previousTitle: [
          { titlingState: "NJ", titleIssueDate: "2020-05-01", odometerReading: "40,000" },
          { titlingState: "C6", titleIssueDate: "2016-01-01", odometerReading: "12000" },
        ],
        vehicleBrands: [
          {
            brand: "Salvage",
            brandDate: "2019-03-01",
            reportingEntityName: "NJ MVC",
            isBrand: true,
          },
          { brand: "Rebuilt", isBrand: true },
          { brand: "Actual Milage", isBrand: true },
        ],
        vehicleDisposition: [
          {
            vehicleDisposition: "Salvage",
            entityName: "Progressive",
            reportingEntityType: "Insurance",
            dateObtained: "2019-02-14",
          },
        ],
      },
      { ...ctx, inquiry: { processedDate: "2026-09-27T01:00:00Z" } },
    );
    expect(s.verdict).toBe("issues");
    expect(s.brands).toEqual(["Salvage (2019-03-01, NJ MVC)", "Rebuilt", "Actual Milage"]);
    expect(s.dispositions).toEqual(["Salvage — Progressive, Insurance (2019-02-14)"]);
    expect(s.titleHistory.map((t) => t.state)).toEqual(["NY", "NJ", "C6"]);
    expect(s.lastTitleState).toBe("NY");
    expect(s.lastOdometer).toBe(61000);
    expect(s.titleRecords).toBe(3);
    expect(s.odometerIssue).toBe(false);
    expect(s.flags).toEqual([
      "Title brand: Salvage (2019-03-01)",
      "Title brand: Rebuilt",
      "Junk/salvage/insurance record: Salvage — Progressive, Insurance (2019-02-14)",
    ]);
  });
  it("is clean with plain history, flags odometer rollback and a low listing mileage", () => {
    const clean = summarizeNmvtis(
      {
        title: [{ titlingState: "MA", titleIssueDate: "2023-01-01", odometerReading: "12345" }],
        vehicleBrands: [],
      },
      ctx,
    );
    expect(clean.verdict).toBe("clean");
    expect(clean.flags).toEqual([]);
    const rolled = summarizeNmvtis(
      {
        title: [{ titlingState: "MA", titleIssueDate: "2023-01-01", odometerReading: "50000" }],
        previousTitle: [
          { titlingState: "MA", titleIssueDate: "2019-01-01", odometerReading: "80000" },
        ],
      },
      { ...ctx, listingMiles: 20_000 },
    );
    expect(rolled.odometerIssue).toBe(true);
    expect(rolled.flags).toEqual([
      "Odometer readings on title history decrease over time",
      "Listing shows 20,000 miles but the last title reading was 50,000",
    ]);
  });
  it("accepts list fields returned as single objects (as the sandbox does)", () => {
    const s = summarizeNmvtis(
      {
        vehicle: { vin: "WP0AA2996XS620000" },
        title: { titlingState: "NY", titleIssueDate: "2024-02-01", odometerReading: "61000" },
        vehicleBrands: { brand: "Rebuilt", isBrand: true },
        vehicleDisposition: null,
      },
      ctx,
    );
    expect(s.processed).toBe(true);
    expect(s.lastTitleState).toBe("NY");
    expect(s.brands).toEqual(["Rebuilt"]);
    expect(s.verdict).toBe("issues");
  });
  it("is pending with no record, unknown when processed with an error and nothing else", () => {
    expect(summarizeNmvtis(null, ctx).verdict).toBe("pending");
    expect(summarizeNmvtis({}, ctx).processed).toBe(false);
    const u = summarizeNmvtis(
      {},
      { ...ctx, inquiry: { processedDate: "x", error: "VIN not found" } },
    );
    expect(u.verdict).toBe("unknown");
    expect(u.flags).toEqual(["NMVTIS lookup error: VIN not found"]);
  });
});

function fakeFetch(handler: (url: string, init?: RequestInit) => Response): typeof fetch {
  return (async (input: RequestInfo | URL, init?: RequestInit) =>
    handler(String(input), init)) as typeof fetch;
}
const base = {
  clientId: "id",
  clientSecret: "secret",
  authUrl: "https://auth.test.vitu.com/realms/api/protocol/openid-connect/token",
  scope: "oneapi:access",
  apiBase: "https://api-test.vitu.com/one/nmvtis/api/v1",
};

describe("NMVTIS inquiry calls", () => {
  it("creates an inquiry with refNumber + vin and loads the record by id", async () => {
    const calls: { url: string; method: string; body: string | null }[] = [];
    const fetchImpl = fakeFetch((url, init) => {
      if (url.includes("/token"))
        return new Response(JSON.stringify({ access_token: "t", expires_in: 300 }));
      calls.push({
        url,
        method: init?.method ?? "GET",
        body: typeof init?.body === "string" ? init.body : null,
      });
      if (url.endsWith("/inquiry")) return new Response(JSON.stringify({ inquiryId: 99 }));
      return new Response(JSON.stringify({ title: [{ titlingState: "NY" }] }));
    });
    const c = { ...base, fetchImpl, clientId: "nmvtis-test" };
    const created = await createNmvtisInquiry(c, { vin: "wp0aa2996xs620000", refNumber: "ref-1" });
    expect(created.inquiryId).toBe(99);
    expect(calls[0]).toMatchObject({ url: `${base.apiBase}/inquiry`, method: "POST" });
    expect(JSON.parse(calls[0]!.body!)).toEqual({ refNumber: "ref-1", vin: "WP0AA2996XS620000" });
    const rec = await loadNmvtisRecord(c, 99);
    expect(calls[1]).toMatchObject({ url: `${base.apiBase}/inquiry/99/record`, method: "GET" });
    expect(many(rec.title)[0]?.titlingState).toBe("NY");
  });
});

describe("getVituToken", () => {
  it("posts form-encoded client credentials with the scope and caches the token", async () => {
    let hits = 0;
    let seenBody = "";
    let seenType = "";
    const fetchImpl = fakeFetch((url, init) => {
      hits++;
      seenBody = String(init?.body);
      seenType = (init?.headers as Record<string, string>)["Content-Type"] ?? "";
      expect(url).toBe(base.authUrl);
      return new Response(JSON.stringify({ access_token: "abc", expires_in: 300 }), {
        status: 200,
      });
    });
    const c = { ...base, clientId: "cache-test", fetchImpl };
    expect(await getVituToken(c, 1_000)).toBe("abc");
    expect(await getVituToken(c, 2_000)).toBe("abc");
    expect(hits).toBe(1);
    expect(seenType).toBe("application/x-www-form-urlencoded");
    expect(seenBody).toContain("grant_type=client_credentials");
    expect(seenBody).toContain("client_id=cache-test");
    expect(seenBody).toContain("scope=oneapi%3Aaccess");
  });
  it("surfaces an invalid_client as a token error", async () => {
    const fetchImpl = fakeFetch(() => new Response('{"error":"invalid_client"}', { status: 401 }));
    await expect(
      getVituToken({ ...base, clientId: "bad", fetchImpl }, 5_000),
    ).rejects.toBeInstanceOf(VituError);
  });
});

describe("vituCall resilience", () => {
  const noSleep = async () => {};
  const tokenOk = () => new Response(JSON.stringify({ access_token: "t", expires_in: 300 }));

  it("sends a timeout signal on the token and API fetches", async () => {
    const signals: (AbortSignal | null | undefined)[] = [];
    const fetchImpl = fakeFetch((url, init) => {
      signals.push(init?.signal);
      if (url.includes("/token")) return tokenOk();
      return new Response("{}");
    });
    await loadNmvtisRecord({ ...base, clientId: "signal-test", fetchImpl, sleepImpl: noSleep }, 1);
    expect(signals).toHaveLength(2);
    for (const s of signals) expect(s).toBeInstanceOf(AbortSignal);
  });

  it("retries a GET once after a 5xx and then succeeds", async () => {
    let hits = 0;
    const slept: number[] = [];
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("/token")) return tokenOk();
      hits++;
      return hits === 1
        ? new Response("bad gateway", { status: 502 })
        : new Response(JSON.stringify({ title: [{ titlingState: "MA" }] }));
    });
    const c = {
      ...base,
      clientId: "retry-get",
      fetchImpl,
      sleepImpl: async (ms: number) => {
        slept.push(ms);
      },
    };
    const rec = await loadNmvtisRecord(c, 5);
    expect(many(rec.title)[0]?.titlingState).toBe("MA");
    expect(hits).toBe(2);
    expect(slept).toEqual([VITU_RETRY_DELAY_MS]);
  });

  it("gives up a GET after the second 5xx", async () => {
    let hits = 0;
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("/token")) return tokenOk();
      hits++;
      return new Response("down", { status: 503 });
    });
    await expect(
      loadNmvtisRecord({ ...base, clientId: "retry-give-up", fetchImpl, sleepImpl: noSleep }, 5),
    ).rejects.toSatisfy((e: unknown) => e instanceof VituError && e.status === 503);
    expect(hits).toBe(2);
  });

  it("never retries the create POST", async () => {
    let posts = 0;
    const fetchImpl = fakeFetch((url) => {
      if (url.includes("/token")) return tokenOk();
      posts++;
      return new Response("boom", { status: 500 });
    });
    await expect(
      createNmvtisInquiry(
        { ...base, clientId: "no-post-retry", fetchImpl, sleepImpl: noSleep },
        { vin: "WP0AA2996XS620000", refNumber: "ref-2" },
      ),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof VituError && e.step === "report" && e.status === 500,
    );
    expect(posts).toBe(1);
  });

  it("wraps a network failure or abort as a VituError with status 0 and retries only GETs", async () => {
    let calls = 0;
    const fetchImpl = (async (input: RequestInfo | URL) => {
      if (String(input).includes("/token")) return tokenOk();
      calls++;
      throw new DOMException("The operation was aborted due to timeout", "TimeoutError");
    }) as typeof fetch;
    const c = { ...base, clientId: "abort-test", fetchImpl, sleepImpl: noSleep };
    await expect(loadNmvtisRecord(c, 1)).rejects.toSatisfy(
      (e: unknown) =>
        e instanceof VituError &&
        e.step === "report" &&
        e.status === 0 &&
        /within 15s/.test(e.message),
    );
    expect(calls).toBe(2);
    calls = 0;
    await expect(
      createNmvtisInquiry(c, { vin: "WP0AA2996XS620000", refNumber: "ref-3" }),
    ).rejects.toSatisfy((e: unknown) => e instanceof VituError && e.status === 0);
    expect(calls).toBe(1);
  });

  it("reports a token fetch that never answers as a token-step error", async () => {
    const fetchImpl = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    await expect(
      getVituToken({ ...base, clientId: "token-network", fetchImpl }, 9_000),
    ).rejects.toSatisfy(
      (e: unknown) => e instanceof VituError && e.step === "token" && e.status === 0,
    );
  });
});
