import "server-only";
import { and, count, desc, eq, gt, gte, isNull, like, max, or, sql, type SQL } from "drizzle-orm";
import { requireAdmin } from "@/auth";
import { db } from "@/db";
import {
  apiBudgets,
  auctionResults,
  carViews,
  dealerActive,
  dealerSales,
  externalListings,
  jobRuns,
  marketSnapshots,
  rawFetches,
} from "@/db/schema";
import { env } from "@/env/server";
import {
  JOBS,
  assessJob,
  baseName,
  describeRun,
  durationOf,
  jobSpec,
  type Assessment,
  type JobSpec,
} from "@/lib/jobs/health";
import { currentMonth } from "@/lib/sources/budget";
import { PAGE_SIZE } from "./rules";

const DAY = 86_400_000;

/** Drivers and raw SQL hand timestamps back as Date or string; the page wants Date. */
function toDate(v: unknown): Date | null {
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "string" || typeof v === "number") {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}
const int = (v: unknown) => Number(v ?? 0) || 0;

export interface JobCard {
  spec: JobSpec;
  last: {
    id: string;
    name: string;
    startedAt: Date;
    finishedAt: Date | null;
    ok: boolean | null;
    dryRun: boolean;
    changed: number | null;
    error: string | null;
    duration: string | null;
    headline: string;
  } | null;
  assessment: Assessment;
  week: { runs: number; failed: number; changed: number };
}

/** One card per job: its latest run, how that reads, and the last seven days in numbers. */
export async function jobHealth(now = new Date()): Promise<JobCard[]> {
  await requireAdmin();
  const since = new Date(now.getTime() - 7 * DAY);
  const [latest, week] = await Promise.all([
    db
      .selectDistinctOn([jobRuns.name], {
        id: jobRuns.id,
        name: jobRuns.name,
        startedAt: jobRuns.startedAt,
        finishedAt: jobRuns.finishedAt,
        ok: jobRuns.ok,
        dryRun: jobRuns.dryRun,
        changed: jobRuns.changed,
        error: jobRuns.error,
        summary: jobRuns.summary,
      })
      .from(jobRuns)
      .orderBy(jobRuns.name, desc(jobRuns.startedAt)),
    db
      .select({
        name: jobRuns.name,
        runs: count(),
        failed: sql<number>`count(*) filter (where ${jobRuns.ok} is false)`,
        changed: sql<number>`coalesce(sum(${jobRuns.changed}), 0)`,
      })
      .from(jobRuns)
      .where(gte(jobRuns.startedAt, since))
      .groupBy(jobRuns.name),
  ]);

  // Variants such as backfill-auctions:live and :past fold into one card.
  const names = new Set<string>(JOBS.map((j) => j.name));
  for (const r of latest) names.add(baseName(r.name));
  const cards: JobCard[] = [];
  for (const name of names) {
    const spec = jobSpec(name);
    const mine = latest.filter((r) => baseName(r.name) === name);
    const last = mine.reduce<(typeof mine)[number] | null>(
      (best, r) => (!best || r.startedAt > best.startedAt ? r : best),
      null,
    );
    const w = week
      .filter((r) => baseName(r.name) === name)
      .reduce(
        (a, r) => ({
          runs: a.runs + int(r.runs),
          failed: a.failed + int(r.failed),
          changed: a.changed + int(r.changed),
        }),
        { runs: 0, failed: 0, changed: 0 },
      );
    const d = last ? describeRun(last.name, last.summary, last.error) : null;
    cards.push({
      spec,
      last:
        last && d
          ? {
              id: last.id,
              name: last.name,
              startedAt: last.startedAt,
              finishedAt: last.finishedAt,
              ok: last.ok,
              dryRun: last.dryRun,
              changed: last.changed ?? d.changed,
              error: last.error,
              duration: durationOf(last),
              headline: d.headline,
            }
          : null,
      assessment: assessJob(spec, last, now),
      week: w,
    });
  }
  // Registry order first, unknown names after.
  const order = new Map(JOBS.map((j, i) => [j.name, i]));
  cards.sort((a, b) => (order.get(a.spec.name) ?? 99) - (order.get(b.spec.name) ?? 99));
  return cards;
}

export interface SourceCard {
  source: "visor" | "ocd";
  label: string;
  configured: boolean;
  used: number;
  cap: number;
  calls24: number;
  errors24: number;
  calls7: number;
  errors7: number;
  rows7: number;
  last: Date | null;
  lastOk: Date | null;
}

export interface SourceHealth {
  month: string;
  sources: SourceCard[];
  failures: { id: string; source: string; endpoint: string; status: number; at: Date }[];
  config: {
    dryRun: boolean;
    cron: boolean;
    blob: boolean;
    vitu: boolean;
    mvr: boolean;
    assistant: boolean;
  };
}

/** Monthly API budgets and the last week of recorded calls for each third-party source. */
export async function sourceHealth(now = new Date()): Promise<SourceHealth> {
  await requireAdmin();
  const month = currentMonth(now);
  const day = new Date(now.getTime() - DAY).toISOString();
  const week = new Date(now.getTime() - 7 * DAY);
  const [budgets, fetches, failures] = await Promise.all([
    db
      .select({ source: apiBudgets.source, used: apiBudgets.callsUsed })
      .from(apiBudgets)
      .where(eq(apiBudgets.month, month)),
    db
      .select({
        source: rawFetches.source,
        calls24: sql<number>`count(*) filter (where ${rawFetches.fetchedAt} >= ${day})`,
        errors24: sql<number>`count(*) filter (where ${rawFetches.fetchedAt} >= ${day} and ${rawFetches.status} >= 400)`,
        calls7: count(),
        errors7: sql<number>`count(*) filter (where ${rawFetches.status} >= 400)`,
        rows7: sql<number>`coalesce(sum(${rawFetches.rowCount}), 0)`,
        last: max(rawFetches.fetchedAt),
        lastOk: sql<unknown>`max(${rawFetches.fetchedAt}) filter (where ${rawFetches.status} < 400)`,
      })
      .from(rawFetches)
      .where(gte(rawFetches.fetchedAt, week))
      .groupBy(rawFetches.source),
    db
      .select({
        id: rawFetches.id,
        source: rawFetches.source,
        endpoint: rawFetches.endpoint,
        status: rawFetches.status,
        at: rawFetches.fetchedAt,
      })
      .from(rawFetches)
      .where(gte(rawFetches.status, 400))
      .orderBy(desc(rawFetches.fetchedAt))
      .limit(8),
  ]);
  const used = new Map(budgets.map((b) => [b.source, b.used]));
  const byFetch = new Map(fetches.map((f) => [f.source, f]));
  const card = (
    source: "visor" | "ocd",
    label: string,
    configured: boolean,
    cap: number,
  ): SourceCard => {
    const f = byFetch.get(source);
    return {
      source,
      label,
      configured,
      used: used.get(source) ?? 0,
      cap,
      calls24: int(f?.calls24),
      errors24: int(f?.errors24),
      calls7: int(f?.calls7),
      errors7: int(f?.errors7),
      rows7: int(f?.rows7),
      last: toDate(f?.last),
      lastOk: toDate(f?.lastOk),
    };
  };
  return {
    month,
    sources: [
      card("visor", "Visor", !!env.VISOR_API_KEY, env.VISOR_MONTHLY_BUDGET),
      card("ocd", "Old Cars Data", !!env.OCD_API_KEY, env.OCD_MONTHLY_BUDGET),
    ],
    failures: failures.map((f) => ({ ...f, at: f.at })),
    config: {
      dryRun: env.jobsDryRun,
      cron: !!env.CRON_SECRET,
      blob: !!env.BLOB_READ_WRITE_TOKEN,
      vitu: !!env.vitu,
      mvr: !!env.vitu?.mvr,
      assistant: !!env.ANTHROPIC_API_KEY,
    },
  };
}

export interface DatasetRow {
  label: string;
  what: string;
  total: number;
  /** Rows fetched or built in the last 24 hours, when the table records that. */
  day: number | null;
  /** Newest fetch, snapshot or build in the table. */
  newest: Date | null;
  /** For daily snapshots, the newest snapshot day as stored. */
  newestDay: string | null;
}

/** Row counts and freshness of the tables the jobs fill. */
export async function dataFreshness(now = new Date()): Promise<DatasetRow[]> {
  await requireAdmin();
  const day = new Date(now.getTime() - DAY).toISOString();
  const today = now.toISOString().slice(0, 10);
  const [[ext], [act], [sold], [auc], [snap], [views]] = await Promise.all([
    db
      .select({
        total: count(),
        live: sql<number>`count(*) filter (where ${externalListings.status} = 'live')`,
        day: sql<number>`count(*) filter (where ${externalListings.fetchedAt} >= ${day})`,
        newest: max(externalListings.fetchedAt),
      })
      .from(externalListings),
    db
      .select({
        total: count(),
        day: sql<number>`count(*) filter (where ${dealerActive.fetchedAt} >= ${day})`,
        newestDay: max(dealerActive.snapshotDate),
      })
      .from(dealerActive),
    db
      .select({
        total: count(),
        day: sql<number>`count(*) filter (where ${dealerSales.fetchedAt} >= ${day})`,
        newest: max(dealerSales.fetchedAt),
      })
      .from(dealerSales),
    db
      .select({
        total: count(),
        day: sql<number>`count(*) filter (where ${auctionResults.fetchedAt} >= ${day})`,
        newest: max(auctionResults.fetchedAt),
      })
      .from(auctionResults),
    db
      .select({
        total: count(),
        day: sql<number>`count(*) filter (where ${marketSnapshots.builtAt} >= ${day})`,
        newest: max(marketSnapshots.builtAt),
      })
      .from(marketSnapshots),
    db
      .select({
        total: sql<number>`coalesce(sum(${carViews.views}), 0)`,
        day: sql<number>`coalesce(sum(${carViews.views}) filter (where ${carViews.day} = ${today}), 0)`,
      })
      .from(carViews),
  ]);
  return [
    {
      label: "Auction listings",
      what: `Old Cars Data, ${int(ext?.live).toLocaleString("en-US")} live`,
      total: int(ext?.total),
      day: int(ext?.day),
      newest: toDate(ext?.newest),
      newestDay: null,
    },
    {
      label: "Auction results",
      what: "Old Cars Data ended auctions with a hammer price",
      total: int(auc?.total),
      day: int(auc?.day),
      newest: toDate(auc?.newest),
      newestDay: null,
    },
    {
      label: "Dealer sales",
      what: "Visor sold rows",
      total: int(sold?.total),
      day: int(sold?.day),
      newest: toDate(sold?.newest),
      newestDay: null,
    },
    {
      label: "Dealer inventory snapshots",
      what: "Visor active rows by snapshot day",
      total: int(act?.total),
      day: int(act?.day),
      newest: null,
      newestDay: act?.newestDay ?? null,
    },
    {
      label: "Market report snapshots",
      what: "Precomputed report JSON per model",
      total: int(snap?.total),
      day: int(snap?.day),
      newest: toDate(snap?.newest),
      newestDay: null,
    },
    {
      label: "Car views",
      what: "Per-day view counts behind Trending",
      total: int(views?.total),
      day: int(views?.day),
      newest: null,
      newestDay: null,
    },
  ];
}

export type RunStatusFilter = "ok" | "failed" | "open";

export interface RunFilter {
  job?: string;
  status?: RunStatusFilter;
  /** Include heartbeat runs that changed nothing. */
  all: boolean;
  page: number;
}

export interface RunRow {
  id: string;
  name: string;
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  dryRun: boolean;
  changed: number | null;
  error: string | null;
  duration: string | null;
  headline: string;
}

/** Paged run history, newest first. By default runs that found nothing to do are hidden. */
export async function listRuns(f: RunFilter): Promise<{ rows: RunRow[]; total: number }> {
  await requireAdmin();
  const conds: SQL[] = [];
  if (f.job && JOBS.some((j) => j.name === f.job))
    conds.push(or(eq(jobRuns.name, f.job), like(jobRuns.name, `${f.job}:%`))!);
  if (f.status === "ok") conds.push(eq(jobRuns.ok, true));
  else if (f.status === "failed") conds.push(eq(jobRuns.ok, false));
  else if (f.status === "open") conds.push(isNull(jobRuns.finishedAt));
  // Rows from before `changed` existed are the heavy jobs, so a null counts as activity.
  if (!f.all)
    conds.push(
      or(sql`${jobRuns.ok} is not true`, gt(jobRuns.changed, 0), isNull(jobRuns.changed))!,
    );
  const where = conds.length ? and(...conds) : undefined;
  const [rows, totals] = await Promise.all([
    db
      .select({
        id: jobRuns.id,
        name: jobRuns.name,
        startedAt: jobRuns.startedAt,
        finishedAt: jobRuns.finishedAt,
        ok: jobRuns.ok,
        dryRun: jobRuns.dryRun,
        changed: jobRuns.changed,
        error: jobRuns.error,
        summary: jobRuns.summary,
      })
      .from(jobRuns)
      .where(where)
      .orderBy(desc(jobRuns.startedAt))
      .limit(PAGE_SIZE)
      .offset((f.page - 1) * PAGE_SIZE),
    db.select({ n: count() }).from(jobRuns).where(where),
  ]);
  return {
    rows: rows.map((r) => {
      const d = describeRun(r.name, r.summary, r.error);
      return {
        id: r.id,
        name: r.name,
        startedAt: r.startedAt,
        finishedAt: r.finishedAt,
        ok: r.ok,
        dryRun: r.dryRun,
        changed: r.changed ?? d.changed,
        error: r.error,
        duration: durationOf(r),
        headline: d.headline,
      };
    }),
    total: int(totals[0]?.n),
  };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function getRun(id: string) {
  await requireAdmin();
  if (!UUID.test(id)) return null;
  const [row] = await db.select().from(jobRuns).where(eq(jobRuns.id, id)).limit(1);
  if (!row) return null;
  const d = describeRun(row.name, row.summary, row.error);
  return {
    ...row,
    changed: row.changed ?? d.changed,
    headline: d.headline,
    duration: durationOf(row),
  };
}
