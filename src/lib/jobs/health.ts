/**
 * Pure job-health rules: the jobs UrCar runs, how often each should run, how a
 * job_run row reads as a status, and a one-line account of what a run did.
 * No I/O, so the admin Health page and its tests share the same judgement.
 */

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

/** A run row still open after this long did not finish: Vercel caps job functions at 5 minutes. */
export const UNFINISHED_AFTER = 10 * MIN;

export interface JobSpec {
  /** job_run.name, or the part before ":" for jobs that suffix a variant (backfill-auctions:live). */
  name: string;
  label: string;
  /** What the job pulls or touches, for the card. */
  what: string;
  /** Expected gap between runs in ms; null for jobs run by hand or on demand. */
  every: number | null;
  /** Allowance past `every` before the job counts as overdue. */
  grace: number;
  schedule: string;
}

export const JOBS: readonly JobSpec[] = [
  {
    name: "nightly",
    label: "Nightly market pull",
    what: "Visor dealer sales and inventory for the stalest slice of the whole catalog (every model about every 14 days; a model's first pull makes its report live), then cleaning, aggregates and retention",
    every: DAY,
    grace: 3 * HOUR,
    schedule: "Daily at 08:15 UTC",
  },
  {
    name: "snapshots",
    label: "Market report snapshots",
    what: "Precomputed market reports for every model with data, after the nightly pull",
    every: DAY,
    grace: 3 * HOUR,
    schedule: "Daily after the nightly pull",
  },
  {
    name: "evidence-sweep",
    label: "Purchase evidence sweep",
    what: "Deletes uploaded proof files that no purchase references",
    every: DAY,
    grace: 3 * HOUR,
    schedule: "Daily after the nightly pull",
  },
  {
    name: "live-auctions",
    label: "Live auctions",
    what: "Old Cars Data auctions updated since the last sweep: new listings, bids, end times; past-end listings marked ended",
    every: 15 * MIN,
    grace: 30 * MIN,
    schedule: "Every 15 minutes",
  },
  {
    name: "ended-auctions",
    label: "Ended auction results",
    what: "Old Cars Data auctions that closed since the last sweep: final price and status, market data for catalog models",
    every: 6 * HOUR,
    grace: 2 * HOUR,
    schedule: "Every 6 hours at :05",
  },
  {
    name: "close-auctions",
    label: "Close ended auctions",
    what: "UrCar auctions past their end time settle as sold or ended",
    every: 5 * MIN,
    grace: 15 * MIN,
    schedule: "Every 5 minutes",
  },
  {
    name: "reports",
    label: "Report requests",
    what: "Builds market reports visitors asked for, oldest request first",
    every: 10 * MIN,
    grace: 20 * MIN,
    schedule: "Every 10 minutes",
  },
  {
    name: "report-build",
    label: "Report builds",
    what: "One source pull for a single requested model, started by Report requests",
    every: null,
    grace: 0,
    schedule: "On demand",
  },
  {
    name: "title-vetting",
    label: "Title vetting",
    what: "Vitu NMVTIS history and MVR owner, lien and registration checks for title orders",
    every: 10 * MIN,
    grace: 20 * MIN,
    schedule: "Every 10 minutes",
  },
  {
    name: "rematch-listings",
    label: "Re-match listings",
    what: "Links platform listings that had no catalog model, or with scope=all moves listings and auction results whose match changed, after an alias or catalog change; run by hand",
    every: null,
    grace: 0,
    schedule: "By hand",
  },
  {
    name: "backfill-auctions",
    label: "Auction backfill",
    what: "One-off bulk pull of live or past auctions from Old Cars Data",
    every: null,
    grace: 0,
    schedule: "By hand",
  },
];

export type JobStatus = "ok" | "failed" | "overdue" | "running" | "unfinished" | "never";

export interface RunLike {
  startedAt: Date;
  finishedAt: Date | null;
  ok: boolean | null;
  dryRun: boolean;
  error: string | null;
}

export function baseName(name: string): string {
  const i = name.indexOf(":");
  return i === -1 ? name : name.slice(0, i);
}

/** The registry entry for a run name, or an ad-hoc unscheduled spec so nothing is hidden. */
export function jobSpec(name: string): JobSpec {
  const base = baseName(name);
  return (
    JOBS.find((j) => j.name === base) ?? {
      name: base,
      label: base,
      what: "Not in the job registry",
      every: null,
      grace: 0,
      schedule: "Unknown",
    }
  );
}

export function ago(ms: number): string {
  if (ms < MIN) return "just now";
  if (ms < HOUR) return `${Math.floor(ms / MIN)} min ago`;
  if (ms < DAY) return `${Math.floor(ms / HOUR)} h ago`;
  const d = Math.floor(ms / DAY);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function fmtDuration(ms: number): string {
  if (ms < 1000) return "<1 s";
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  return `${m} min ${s - m * 60} s`;
}

export function durationOf(run: { startedAt: Date; finishedAt: Date | null }): string | null {
  return run.finishedAt ? fmtDuration(run.finishedAt.getTime() - run.startedAt.getTime()) : null;
}

const firstLine = (s: string) => s.split("\n")[0]?.trim() ?? "";

export interface Assessment {
  status: JobStatus;
  detail: string;
}

/**
 * Reads the latest run of a job as a status. Overdue wins over a failed last run
 * because it means the schedule itself is not firing; an open row older than
 * UNFINISHED_AFTER means the function died before it could write its result.
 */
export function assessJob(spec: JobSpec, last: RunLike | null, now: Date): Assessment {
  if (!last) return { status: "never", detail: spec.every ? "No run recorded yet" : "Not run yet" };
  const age = now.getTime() - last.startedAt.getTime();
  if (!last.finishedAt) {
    if (age <= UNFINISHED_AFTER) return { status: "running", detail: `Started ${ago(age)}` };
    return {
      status: "unfinished",
      detail: `Started ${ago(age)} and never wrote a result; the function likely timed out or crashed`,
    };
  }
  if (spec.every != null && age > spec.every + spec.grace) {
    const failedToo = last.ok === false ? " (and that run failed)" : "";
    return {
      status: "overdue",
      detail: `Last run ${ago(age)}${failedToo}; expected ${spec.schedule.toLowerCase()}`,
    };
  }
  if (last.ok === false) {
    return {
      status: "failed",
      detail: last.error ? firstLine(last.error).slice(0, 160) : `Failed ${ago(age)}`,
    };
  }
  return { status: "ok", detail: `Last run ${ago(age)}` };
}

export function statusTone(status: JobStatus): "up" | "down" | "accent" | "" {
  switch (status) {
    case "ok":
      return "up";
    case "failed":
    case "overdue":
    case "unfinished":
      return "down";
    case "running":
      return "accent";
    default:
      return "";
  }
}

export function statusLabel(status: JobStatus): string {
  switch (status) {
    case "ok":
      return "healthy";
    case "unfinished":
      return "did not finish";
    case "never":
      return "no runs";
    default:
      return status;
  }
}

/** True when the status needs a person to look at it. */
/** A scheduled job with no run yet: not a failure, but worth saying out loud. */
export function notRunYet(status: JobStatus, spec: JobSpec): boolean {
  return status === "never" && spec.every != null;
}

export function needsAttention(status: JobStatus): boolean {
  return status === "failed" || status === "overdue" || status === "unfinished";
}

type J = Record<string, unknown>;
const obj = (v: unknown): J => (v && typeof v === "object" && !Array.isArray(v) ? (v as J) : {});
const arr = (o: J, k: string): unknown[] => (Array.isArray(o[k]) ? (o[k] as unknown[]) : []);
const num = (o: J, k: string): number => {
  const v = o[k];
  return typeof v === "number" && Number.isFinite(v) ? v : 0;
};
const str = (o: J, k: string): string | null =>
  typeof o[k] === "string" ? (o[k] as string) : null;
const n = (v: number) => v.toLocaleString("en-US");
const plural = (v: number, one: string, many = `${one}s`) => `${n(v)} ${v === 1 ? one : many}`;

export interface RunDescription {
  headline: string;
  /** Derived from the summary for rows written before job_run.changed existed. */
  changed: number | null;
}

/** One line on what a run did, from its stored summary. Never throws on odd shapes. */
export function describeRun(name: string, summary: unknown, error: string | null): RunDescription {
  const s = obj(summary);
  const parts: string[] = [];
  let changed: number | null = null;
  switch (baseName(name)) {
    case "nightly":
    case "report-build": {
      const models = arr(s, "models").map(obj);
      const sum = (k: string) => models.reduce((a, m) => a + num(m, k), 0);
      const sold = sum("visorSold");
      const active = sum("visorActive");
      const auctions = sum("ocdAuctions");
      const unmatched = sum("unmatchedRows");
      const review = sum("needsReview");
      const stopped = models.filter((m) => arr(m, "budgetStopped").length).length;
      // Rows written are recorded since the Health page shipped; older rows only know what was pulled.
      const hasInserted = models.some((m) => Object.keys(obj(m.inserted)).length > 0);
      const inserted = models.reduce((a, m) => {
        const i = obj(m.inserted);
        return a + num(i, "sold") + num(i, "active") + num(i, "auctions");
      }, 0);
      const rotation = obj(s.rotation);
      parts.push(plural(models.length, "model"), `Visor ${n(sold)} sold, ${n(active)} active`);
      // Nightly rotations no longer pull auctions; report builds still do.
      if (auctions || !Object.keys(rotation).length)
        parts.push(`Old Cars Data ${plural(auctions, "auction")}`);
      if (hasInserted) parts.push(`${plural(inserted, "new row")} written`);
      if (Object.keys(rotation).length) {
        parts.push(
          `${n(num(rotation, "pulled"))} of ${n(num(rotation, "eligible"))} models refreshed (${plural(num(rotation, "visorCalls"), "Visor call")})`,
        );
        if (num(rotation, "promoted"))
          parts.push(`${plural(num(rotation, "promoted"), "new report")}`);
        if (num(rotation, "failed")) parts.push(`${n(num(rotation, "failed"))} failed`);
        const stoppedBy = str(rotation, "stoppedBy");
        const reason =
          stoppedBy === "allowance"
            ? "call allowance reached"
            : stoppedBy === "budget"
              ? "Visor budget reached"
              : "time cap hit";
        if (num(rotation, "remaining"))
          parts.push(`${reason}, ${plural(num(rotation, "remaining"), "model")} left`);
        else if (rotation["budgetStopped"] === true) parts.push("Visor budget reached");
        if (num(rotation, "cleaned")) parts.push(`${n(num(rotation, "cleaned"))} re-cleaned`);
      }
      if (unmatched) parts.push(`${n(unmatched)} unmatched`);
      if (review) parts.push(`${n(review)} to review`);
      if (stopped) parts.push(`budget stopped ${plural(stopped, "model")}`);
      const pruned = obj(s.pruned);
      const prunedTotal = num(pruned, "rawFetch") + num(pruned, "carView") + num(pruned, "jobRun");
      if (Object.keys(pruned).length) parts.push(`pruned ${plural(prunedTotal, "old row")}`);
      changed = hasInserted ? inserted : null;
      break;
    }
    case "live-auctions": {
      const upserted = num(s, "upserted");
      const ended = num(s, "markedEnded");
      const reconciled = num(s, "reconciled");
      parts.push(
        `pulled ${n(num(s, "pulled"))}`,
        `${n(upserted)} added or updated`,
        `${n(num(s, "matchedToCatalog"))} matched to catalog`,
        `${n(ended)} ended`,
      );
      if (reconciled) parts.push(`${n(reconciled)} reconciled`);
      const liveSkipped = str(s, "skipped");
      if (liveSkipped) parts.push(`skipped: ${liveSkipped}`);
      if (typeof s.pages === "number") parts.push(plural(num(s, "pages"), "page"));
      if (s.truncated === true) parts.push("page cap hit");
      const stop = str(s, "budgetStopped");
      if (stop) parts.push(`budget stopped: ${stop}`);
      changed = upserted + ended + reconciled;
      break;
    }
    case "backfill-auctions": {
      if (!Object.keys(s).length) break;
      const upserted = num(s, "upserted");
      const results = num(s, "auctionResultsInserted");
      const part = str(s, "part");
      if (part) parts.push(part === "past" ? `past ${num(s, "days") || "?"} days` : "live");
      parts.push(
        `pulled ${n(num(s, "pulled"))}`,
        `${n(upserted)} added or updated`,
        `${n(num(s, "matchedToCatalog"))} matched to catalog`,
      );
      if (results) parts.push(`${plural(results, "auction result")} stored`);
      const stop = str(s, "budgetStopped");
      if (stop) parts.push(`budget stopped: ${stop}`);
      changed = upserted + results;
      break;
    }
    case "rematch-listings": {
      const updated = num(s, "updated");
      const auctions = num(s, "auctionsUpdated");
      parts.push(
        `${str(s, "scope") === "all" ? "every listing" : "unmatched listings"}: ${n(num(s, "scanned"))} scanned`,
        `${n(num(s, "matched"))} placed`,
        `${n(updated)} written`,
      );
      if (num(s, "auctionsScanned"))
        parts.push(`${n(num(s, "auctionsScanned"))} auction results scanned, ${n(auctions)} moved`);
      changed = updated + auctions;
      break;
    }
    case "ended-auctions": {
      const skipped = str(s, "skipped");
      if (skipped) parts.push(`skipped: ${skipped}`);
      else {
        const upserted = num(s, "upserted");
        const results = num(s, "auctionResultsInserted");
        parts.push(
          `pulled ${plural(num(s, "pulled"), "closed auction")}`,
          `${n(upserted)} added or updated`,
          `${n(num(s, "matchedToCatalog"))} matched to catalog`,
        );
        if (results) parts.push(`${plural(results, "result")} stored`);
        if (typeof s.pages === "number") parts.push(plural(num(s, "pages"), "page"));
        if (s.truncated === true) parts.push("page cap hit");
        const stop = str(s, "budgetStopped");
        if (stop) parts.push(`budget stopped: ${stop}`);
        changed = upserted + results;
      }
      break;
    }
    case "close-auctions": {
      const closed = num(s, "closed");
      parts.push(
        closed
          ? `closed ${plural(closed, "auction")}: ${n(num(s, "sold"))} sold, ${n(num(s, "ended"))} ended`
          : "nothing due",
      );
      changed = closed;
      break;
    }
    case "reports": {
      const processed = arr(s, "processed").map(obj);
      const ready = processed.filter((p) => p["status"] === "ready");
      const failed = processed.filter((p) => p["status"] === "failed");
      if (!processed.length) parts.push("queue empty");
      else {
        parts.push(`${plural(ready.length, "report")} ready`);
        if (failed.length) parts.push(`${n(failed.length)} failed`);
        const names = processed.map((p) => str(p, "model")).filter((v): v is string => !!v);
        if (names.length) parts.push(names.slice(0, 4).join(", ") + (names.length > 4 ? "…" : ""));
      }
      changed = processed.length;
      break;
    }
    case "title-vetting": {
      const processed = arr(s, "processed").map(obj);
      const skipped = str(s, "skipped");
      if (skipped) parts.push(`skipped: ${skipped}`);
      else if (!processed.length) parts.push("no orders waiting");
      else {
        // One entry per step, so an order checked by NMVTIS and MVR appears twice.
        const orders =
          new Set(processed.map((p) => str(p, "id")).filter((v): v is string => !!v)).size ||
          processed.length;
        const steps = new Map<string, number>();
        for (const p of processed) {
          const step = str(p, "step") ?? "step";
          steps.set(step, (steps.get(step) ?? 0) + 1);
        }
        parts.push(
          `${plural(orders, "order")}: ` + [...steps].map(([k, v]) => `${k} ${n(v)}`).join(", "),
        );
      }
      changed = processed.length;
      break;
    }
    case "snapshots": {
      const failed = arr(s, "failed");
      parts.push(`built ${plural(num(s, "built"), "report")}`);
      if (failed.length) parts.push(`${n(failed.length)} failed`);
      if (num(s, "skipped")) parts.push(`${n(num(s, "skipped"))} skipped at the time cap`);
      changed = num(s, "built");
      break;
    }
    case "evidence-sweep": {
      const skipped = str(s, "skipped");
      parts.push(`scanned ${plural(num(s, "scanned"), "file")}`, `deleted ${n(num(s, "deleted"))}`);
      if (skipped) parts.push(`skipped: ${skipped}`);
      changed = num(s, "deleted");
      break;
    }
    default: {
      for (const [k, v] of Object.entries(s))
        if (typeof v === "number" && Number.isFinite(v)) parts.push(`${k} ${n(v)}`);
    }
  }
  const errs = arr(s, "errors").length;
  if (errs) parts.push(plural(errs, "error"));
  let headline = parts.join(" · ");
  if (!headline) headline = error ? firstLine(error).slice(0, 160) : "no details recorded";
  return { headline, changed };
}

/** Summary readers shared with the run detail page. */
export { obj as summaryObject, arr as summaryList };
