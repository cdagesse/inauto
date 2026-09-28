import { describe, expect, it } from "vitest";
import {
  JOBS,
  UNFINISHED_AFTER,
  ago,
  assessJob,
  baseName,
  describeRun,
  fmtDuration,
  jobSpec,
  needsAttention,
  statusTone,
} from "@/lib/jobs/health";

const now = new Date("2026-09-28T12:00:00Z");
const at = (msAgo: number) => new Date(now.getTime() - msAgo);
const MIN = 60_000;
const HOUR = 60 * MIN;
const nightly = jobSpec("nightly");
const closeAuctions = jobSpec("close-auctions");
const backfill = jobSpec("backfill-auctions");

const run = (over: Partial<Parameters<typeof assessJob>[1] & object> = {}) => ({
  startedAt: at(HOUR),
  finishedAt: at(HOUR - 2 * MIN),
  ok: true,
  dryRun: false,
  error: null,
  ...over,
});

describe("job registry", () => {
  it("resolves variants to their base job and unknown names to an ad-hoc spec", () => {
    expect(baseName("backfill-auctions:past")).toBe("backfill-auctions");
    expect(baseName("nightly")).toBe("nightly");
    expect(jobSpec("backfill-auctions:live").name).toBe("backfill-auctions");
    const odd = jobSpec("mystery:thing");
    expect(odd.name).toBe("mystery");
    expect(odd.every).toBeNull();
  });

  it("has unique names and a schedule string for every job", () => {
    expect(new Set(JOBS.map((j) => j.name)).size).toBe(JOBS.length);
    for (const j of JOBS) expect(j.schedule.length).toBeGreaterThan(0);
  });
});

describe("assessJob", () => {
  it("reports no runs", () => {
    expect(assessJob(nightly, null, now).status).toBe("never");
    expect(assessJob(backfill, null, now).status).toBe("never");
  });

  it("treats a fresh open row as running and a stale one as unfinished", () => {
    expect(assessJob(nightly, run({ startedAt: at(MIN), finishedAt: null }), now).status).toBe(
      "running",
    );
    const stale = assessJob(
      nightly,
      run({ startedAt: at(UNFINISHED_AFTER + MIN), finishedAt: null }),
      now,
    );
    expect(stale.status).toBe("unfinished");
    expect(stale.detail).toMatch(/never wrote a result/);
  });

  it("is overdue once the schedule plus grace has passed, even if the last run succeeded", () => {
    const late = run({ startedAt: at(28 * HOUR), finishedAt: at(28 * HOUR - MIN) });
    const a = assessJob(nightly, late, now);
    expect(a.status).toBe("overdue");
    expect(a.detail).toMatch(/expected daily at 08:15 utc/);
    expect(assessJob(closeAuctions, run({ startedAt: at(25 * MIN) }), now).status).toBe("overdue");
    expect(
      assessJob(closeAuctions, run({ startedAt: at(12 * MIN), finishedAt: at(11 * MIN) }), now)
        .status,
    ).toBe("ok");
  });

  it("never marks a by-hand job overdue", () => {
    expect(assessJob(backfill, run({ startedAt: at(40 * 24 * HOUR) }), now).status).toBe("ok");
  });

  it("surfaces the first line of the error on a failed run", () => {
    const a = assessJob(
      nightly,
      run({ ok: false, error: "visor: 502 Bad Gateway\nsecond line" }),
      now,
    );
    expect(a.status).toBe("failed");
    expect(a.detail).toBe("visor: 502 Bad Gateway");
  });

  it("mentions a failed run inside an overdue verdict", () => {
    const a = assessJob(nightly, run({ startedAt: at(30 * HOUR), ok: false }), now);
    expect(a.status).toBe("overdue");
    expect(a.detail).toMatch(/and that run failed/);
  });

  it("maps statuses to tones and attention", () => {
    expect(statusTone("ok")).toBe("up");
    expect(statusTone("overdue")).toBe("down");
    expect(statusTone("running")).toBe("accent");
    expect(needsAttention("unfinished")).toBe(true);
    expect(needsAttention("never")).toBe(false);
  });
});

describe("time formatting", () => {
  it("formats ages and durations", () => {
    expect(ago(20_000)).toBe("just now");
    expect(ago(5 * MIN)).toBe("5 min ago");
    expect(ago(3 * HOUR)).toBe("3 h ago");
    expect(ago(24 * HOUR)).toBe("1 day ago");
    expect(ago(50 * HOUR)).toBe("2 days ago");
    expect(fmtDuration(400)).toBe("<1 s");
    expect(fmtDuration(12_400)).toBe("12 s");
    expect(fmtDuration(184_000)).toBe("3 min 4 s");
  });
});

describe("describeRun", () => {
  it("sums a nightly run across models and derives rows changed", () => {
    const d = describeRun(
      "nightly",
      {
        models: [
          {
            model: "bmw/m3",
            visorSold: 40,
            visorActive: 300,
            ocdAuctions: 12,
            unmatchedRows: 3,
            needsReview: 1,
          },
          {
            model: "porsche/911",
            visorSold: 10,
            visorActive: 200,
            ocdAuctions: 30,
            budgetStopped: ["ocd"],
          },
        ],
        errors: ["porsche/911: ocd 500"],
        pruned: { rawFetch: 100, carView: 20, jobRun: 5 },
      },
      null,
    );
    expect(d.headline).toBe(
      "2 models · Visor 50 sold, 500 active · Old Cars Data 42 auctions · 3 unmatched · 1 to review · budget stopped 1 model · pruned 125 old rows · 1 error",
    );
    expect(d.changed).toBe(592);
  });

  it("describes live auctions, backfills and closes", () => {
    expect(
      describeRun(
        "live-auctions",
        {
          pulled: 1800,
          upserted: 120,
          matchedToCatalog: 90,
          markedEnded: 15,
          reconciled: 2,
          budgetStopped: null,
        },
        null,
      ),
    ).toEqual({
      headline:
        "pulled 1,800 · 120 added or updated · 90 matched to catalog · 15 ended · 2 reconciled",
      changed: 137,
    });
    expect(
      describeRun(
        "backfill-auctions:past",
        {
          part: "past",
          days: 30,
          pulled: 7789,
          upserted: 7789,
          matchedToCatalog: 2893,
          auctionResultsInserted: 2893,
        },
        null,
      ).headline,
    ).toBe(
      "past 30 days · pulled 7,789 · 7,789 added or updated · 2,893 matched to catalog · 2,893 auction results stored",
    );
    expect(describeRun("close-auctions", { closed: 0, sold: 0, ended: 0, ids: [] }, null)).toEqual({
      headline: "nothing due",
      changed: 0,
    });
    expect(describeRun("close-auctions", { closed: 2, sold: 1, ended: 1 }, null).headline).toBe(
      "closed 2 auctions: 1 sold, 1 ended",
    );
  });

  it("describes report passes, title vetting, snapshots and the evidence sweep", () => {
    expect(
      describeRun(
        "reports",
        {
          processed: [
            { model: "audi/rs6", status: "ready" },
            { model: "ford/gt", status: "failed" },
          ],
        },
        null,
      ).headline,
    ).toBe("1 report ready · 1 failed · audi/rs6, ford/gt");
    expect(describeRun("reports", { processed: [] }, null).headline).toBe("queue empty");
    expect(
      describeRun(
        "title-vetting",
        {
          processed: [
            { id: "a", step: "nmvtis" },
            { id: "b", step: "nmvtis" },
            { id: "c", step: "mvr" },
          ],
          skipped: null,
          errors: [],
        },
        null,
      ),
    ).toEqual({ headline: "3 orders: nmvtis 2, mvr 1", changed: 3 });
    expect(
      describeRun(
        "title-vetting",
        { processed: [], skipped: "Vitu not configured", errors: [] },
        null,
      ).headline,
    ).toBe("skipped: Vitu not configured");
    expect(
      describeRun("snapshots", { built: 41, failed: ["bmw/m3: store write failed"] }, null),
    ).toEqual({
      headline: "built 41 reports · 1 failed",
      changed: 41,
    });
    expect(
      describeRun("evidence-sweep", { scanned: 12, deleted: 0, skipped: "dry run" }, null).headline,
    ).toBe("scanned 12 files · deleted 0 · skipped: dry run");
  });

  it("falls back to numeric keys, then the error, and never throws on odd shapes", () => {
    expect(describeRun("mystery", { a: 1, b: "x", c: 2.5 }, null)).toEqual({
      headline: "a 1 · c 2.5",
      changed: null,
    });
    expect(describeRun("mystery", null, "boom\nmore").headline).toBe("boom");
    expect(describeRun("mystery", "not an object", null).headline).toBe("no details recorded");
    expect(describeRun("nightly", { models: "nope", errors: 3 }, null).headline).toBe(
      "0 models · Visor 0 sold, 0 active · Old Cars Data 0 auctions",
    );
  });
});
