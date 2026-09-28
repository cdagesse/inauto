import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db as defaultDb, type Db } from "@/db";
import { listings, serviceOrders, users } from "@/db/schema";
import { env } from "@/env/server";
import {
  createNmvtisInquiry,
  isNotReady,
  loadNmvtisInquiry,
  loadNmvtisInquiryByRef,
  loadNmvtisRecord,
  type NmvtisConfig,
  summarizeNmvtis,
  type TitleSummary,
  VituError,
} from "@/lib/sources/vitu";
import {
  createMvrInquiry,
  loadInquiryByRef,
  loadInquiryStatus,
  loadUnifiedRecord,
  type MvrConfig,
  type MvrSummary,
  stateFromLocation,
  summarizeMvr,
} from "@/lib/sources/vitu-mvr";

export interface TitleVettingSummary {
  processed: { id: string; step: string; verdict?: string }[];
  skipped: string | null;
  errors: string[];
}

interface OrderRow {
  id: string;
  vin: string | null;
  listingId: string | null;
  location: string | null;
  miles: number | null;
  sellerLegalName: string | null;
  sellerName: string | null;
  details: Record<string, unknown> | null;
  result: Record<string, unknown> | null;
  status: string;
}

/** Stored in details.nmvtis / details.mvr once an inquiry has been created. */
export interface InquiryRef {
  refNumber: string;
  inquiryId: number | null;
  state?: string;
  createdAt: string;
}

/** Admin test orders (no listing) carry their inputs here: details.test. */
export interface TestInputs {
  state?: string | null;
  sellerName?: string | null;
  miles?: number | null;
}

const isVin = (v: string) => /^[A-HJ-NPR-Z0-9]{11,17}$/.test(v);
/** Admin test orders may use Vitu's sandbox test strings (e.g. "DIALTEST10", "Z038981"). */
const isTestString = (v: string) => /^[A-Z0-9 .-]{5,17}$/i.test(v);
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));
/**
 * Sandbox creates answer inquiryId 0 (NMVTIS) or 999999 (MVR: a portal mock served while the
 * application's registration to the product is pending); both mean "resolve by refNumber".
 */
const PLACEHOLDER_IDS = new Set([0, 999999]);
const realId = (id: number | null | undefined) =>
  typeof id === "number" && id > 0 && !PLACEHOLDER_IDS.has(id) ? id : null;
const PLACEHOLDER_NOTE =
  "Vitu answered the create with a placeholder id, so no inquiry exists on their side. Expand the raw responses: if the create's headers include x-kong-mocking-plugin, the gateway mocked the call and the account needs provisioning from Vitu support; otherwise try the sandbox test strings from the spec examples (NY DIALTEST10) or add request flags through VITU_MVR_STATE_EXTRAS.";

/**
 * Fulfils title-vetting orders through Vitu. Two independent, asynchronous parts:
 *  - NMVTIS vehicle history (brands, title history, junk/salvage/insurance) when
 *    VITU_NMVTIS_ENABLED is not "false";
 *  - MVR (live DMV record: registered owner, lienholder, registration) when
 *    VITU_MVR_ENABLED is "true".
 * Each inquiry is created once (stored in details.nmvtis / details.mvr) and read
 * back on later runs, or when the Vitu notification webhook fires, until the
 * provider has processed it. The order completes when every configured part has
 * a result; the listing is marked title-vetted only when every part passes.
 */
export async function runTitleVetting(
  opts: { db?: Db; limit?: number; log?: (m: string) => void; onlyOrderId?: string } = {},
): Promise<TitleVettingSummary> {
  const db = opts.db ?? defaultDb;
  const log = opts.log ?? ((m: string) => console.log(`[title-vetting] ${m}`));
  const limit = Math.max(1, Math.min(opts.limit ?? 10, 50));
  const out: TitleVettingSummary = { processed: [], skipped: null, errors: [] };
  const cfg = env.vitu;
  const nmvtis = cfg?.nmvtis ? { ...cfg, ...cfg.nmvtis } : null;
  const mvr = cfg?.mvr ? { ...cfg, ...cfg.mvr } : null;
  if (!cfg || (!nmvtis && !mvr)) {
    out.skipped =
      "Vitu not configured (set VITU_CLIENT_ID/SECRET; VITU_NMVTIS_ENABLED and/or VITU_MVR_ENABLED)";
    log(out.skipped);
    return out;
  }

  const eligible = and(
    eq(serviceOrders.kind, "title_vetting"),
    opts.onlyOrderId
      ? eq(serviceOrders.id, opts.onlyOrderId)
      : sql`${serviceOrders.status} in ('requested', 'in_progress')`,
    sql`coalesce(${serviceOrders.details}->>'automated', '') <> 'off'`,
  );
  const due = await db
    .select({ id: serviceOrders.id })
    .from(serviceOrders)
    .where(eligible)
    .orderBy(serviceOrders.createdAt)
    .limit(limit);

  // Each order runs in its own transaction under FOR UPDATE SKIP LOCKED (the close-auctions
  // pattern): the cron, the Vitu webhook and the admin tester can overlap, and two runs that
  // both saw "no inquiry yet" would each create a billed inquiry. The lock is held across the
  // Vitu calls so the details we write back are the ones we read.
  for (const { id } of due) {
    const stop = await db.transaction(async (tx) => {
      const [o] = (await tx
        .select({
          id: serviceOrders.id,
          vin: sql<string | null>`coalesce(${serviceOrders.vin}, ${listings.vin})`,
          listingId: serviceOrders.listingId,
          location: listings.location,
          miles: listings.miles,
          sellerLegalName: sql<string | null>`${listings.sellerDetails}->>'legalName'`,
          sellerName: users.name,
          details: serviceOrders.details,
          result: serviceOrders.result,
          status: serviceOrders.status,
        })
        .from(serviceOrders)
        .leftJoin(listings, eq(listings.id, serviceOrders.listingId))
        .leftJoin(users, eq(users.id, listings.sellerId))
        .where(and(eq(serviceOrders.id, id), eligible))
        .for("update", { of: serviceOrders, skipLocked: true })) as OrderRow[];
      if (!o) {
        log(`skip ${id}: locked by another run or no longer eligible`);
        return false;
      }
      return processOrder(tx, o, { nmvtis, mvr, out, log });
    });
    if (stop) break;
  }
  return out;
}

type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

interface OrderContext {
  nmvtis: NmvtisConfig | null;
  mvr: MvrConfig | null;
  out: TitleVettingSummary;
  log: (m: string) => void;
}

/** Runs both Vitu parts for one locked order and persists the outcome. Returns true when the batch should stop. */
async function processOrder(tx: Tx, o: OrderRow, ctx: OrderContext): Promise<boolean> {
  const { nmvtis, mvr, out, log } = ctx;
  const vin = (o.vin ?? "").trim().toUpperCase();
  const isTest = !!(o.details as { test?: unknown } | null)?.test;
  if (!(isVin(vin) || (isTest && isTestString(vin)))) {
    log(`skip ${o.id}: no usable VIN`);
    return false;
  }
  const details: Record<string, unknown> = { ...(o.details ?? {}) };
  const result: Record<string, unknown> = { ...(o.result ?? {}) };
  const test = (details.test as TestInputs | undefined) ?? null;
  const state = test?.state?.toUpperCase() || stateFromLocation(o.location);
  const sellerName = test?.sellerName || o.sellerLegalName || o.sellerName || null;
  const miles = typeof test?.miles === "number" ? test.miles : o.miles;
  let touched = false;
  let stop = false;

  // Part 1: NMVTIS vehicle history.
  if (nmvtis && !result.summary) {
    const ref = (details.nmvtis as InquiryRef | undefined) ?? null;
    try {
      if (!ref) {
        const refNumber = randomUUID();
        let http: unknown = null;
        const created = await createNmvtisInquiry(
          { ...nmvtis, onResponse: (i) => (http = i) },
          { vin, refNumber },
        );
        details.nmvtis = {
          refNumber,
          inquiryId: created.inquiryId,
          createdAt: new Date().toISOString(),
        } satisfies InquiryRef;
        details.nmvtisCreateResponse = { body: created.raw, http };
        touched = true;
        out.processed.push({ id: o.id, step: "nmvtis-created" });
      } else {
        const notes: string[] = [];
        const soft = (label: string) => (e: unknown) => {
          if (isNotReady(e)) {
            notes.push(`${label}: ${errText(e)}`);
            return null;
          }
          throw e;
        };
        // Resolve the inquiry: by id when we have a real one, else by our refNumber.
        let inquiry = realId(ref.inquiryId)
          ? await loadNmvtisInquiry(nmvtis, ref.inquiryId!).catch(soft("load by id"))
          : null;
        if (!inquiry)
          inquiry = await loadNmvtisInquiryByRef(nmvtis, ref.refNumber).catch(
            soft("load by refNumber"),
          );
        const inquiryId = realId(inquiry?.inquiryId) ?? realId(ref.inquiryId);
        if (inquiryId && inquiryId !== ref.inquiryId) {
          details.nmvtis = { ...ref, inquiryId } satisfies InquiryRef;
          touched = true;
        }
        if (!inquiryId) notes.push(PLACEHOLDER_NOTE);
        const record = inquiryId
          ? await loadNmvtisRecord(nmvtis, inquiryId).catch(soft("load record"))
          : null;
        if (record) details.report = record; // keep the raw shape even if summarising throws
        const summary: TitleSummary = summarizeNmvtis(record, {
          vin,
          inquiryId,
          refNumber: ref.refNumber,
          inquiry,
          listingMiles: miles,
        });
        if (inquiry) details.nmvtisInquiry = inquiry;
        if (notes.length) details.nmvtisLastError = { at: new Date().toISOString(), notes };
        else delete details.nmvtisLastError;
        if (summary.processed) {
          details.report = record;
          result.summary = summary;
          touched = true;
          out.processed.push({ id: o.id, step: "nmvtis", verdict: summary.verdict });
        } else {
          touched = touched || !!inquiry || notes.length > 0;
          log(`${o.id} nmvtis still pending${notes.length ? ` (${notes.join(" | ")})` : ""}`);
        }
      }
    } catch (e) {
      const msg = errText(e);
      out.errors.push(`${o.id} nmvtis: ${msg}`);
      log(`error ${o.id} nmvtis: ${msg}`);
      details.nmvtisLastError = { at: new Date().toISOString(), notes: [msg] };
      touched = true;
      if (e instanceof VituError && e.step === "token") stop = true;
    }
  }

  // Part 2: MVR live state record.
  if (mvr && !result.mvr && !stop) {
    const ref = (details.mvr as InquiryRef | undefined) ?? null;
    if (!ref && !state) log(`skip mvr ${o.id}: no state known for this vehicle`);
    else {
      try {
        if (!ref) {
          const refNumber = randomUUID();
          let http: unknown = null;
          const created = await createMvrInquiry(
            { ...mvr, onResponse: (i) => (http = i) },
            { state: state!, vin, refNumber },
          );
          details.mvr = {
            refNumber,
            inquiryId: created.inquiryId,
            state: state!,
            createdAt: new Date().toISOString(),
          } satisfies InquiryRef;
          details.mvrCreateResponse = { body: created.raw, http };
          touched = true;
          out.processed.push({ id: o.id, step: "mvr-created" });
        } else {
          const notes: string[] = [];
          const soft = (label: string) => (e: unknown) => {
            if (isNotReady(e)) {
              notes.push(`${label}: ${errText(e)}`);
              return null;
            }
            throw e;
          };
          let inquiry = realId(ref.inquiryId)
            ? await loadInquiryStatus(mvr, ref.inquiryId!).catch(soft("load by id"))
            : null;
          if (!inquiry)
            inquiry = await loadInquiryByRef(mvr, ref.refNumber).catch(soft("load by refNumber"));
          const inquiryId = realId(inquiry?.inquiryId) ?? realId(ref.inquiryId);
          if (inquiryId && inquiryId !== ref.inquiryId) {
            details.mvr = { ...ref, inquiryId } satisfies InquiryRef;
            touched = true;
          }
          const record = inquiryId
            ? await loadUnifiedRecord(mvr, inquiryId).catch(soft("load record"))
            : null;
          if (record) details.mvrRecord = record;
          if (!inquiryId) notes.push(PLACEHOLDER_NOTE);
          const summary: MvrSummary = summarizeMvr(record, {
            vin,
            state: ref.state ?? state ?? "",
            refNumber: ref.refNumber,
            inquiryId,
            sellerName,
            listingMiles: miles,
            inquiry,
          });
          if (inquiry) details.mvrInquiry = inquiry;
          if (notes.length) details.mvrLastError = { at: new Date().toISOString(), notes };
          else delete details.mvrLastError;
          if (summary.processed) {
            details.mvrRecord = record;
            result.mvr = summary;
            touched = true;
            out.processed.push({ id: o.id, step: "mvr", verdict: summary.verdict });
          } else {
            touched = touched || !!inquiry || notes.length > 0;
            log(`${o.id} mvr still pending${notes.length ? ` (${notes.join(" | ")})` : ""}`);
          }
        }
      } catch (e) {
        const msg = errText(e);
        out.errors.push(`${o.id} mvr: ${msg}`);
        log(`error ${o.id} mvr: ${msg}`);
        details.mvrLastError = { at: new Date().toISOString(), notes: [msg] };
        touched = true;
        if (e instanceof VituError && e.step === "token") stop = true;
      }
    }
  }

  const nmvtisDone = !nmvtis || !!result.summary;
  const mvrDone = !mvr || !!result.mvr || (!details.mvr && !state);
  const complete = nmvtisDone && mvrDone;
  if (touched || (complete && o.status !== "complete")) {
    const s = result.summary as TitleSummary | undefined;
    const m = result.mvr as MvrSummary | undefined;
    const passes = [s ? s.verdict === "clean" : null, m ? m.verdict === "verified" : null].filter(
      (v): v is boolean => v !== null,
    );
    const vetted = passes.length > 0 && passes.every(Boolean);
    const notes = [
      s ? `NMVTIS ${s.verdict}${s.flags.length ? ` (${s.flags.join("; ")})` : ""}` : null,
      m ? `MVR ${m.verdict}${m.flags.length ? ` (${m.flags.join("; ")})` : ""}` : null,
    ].filter(Boolean);
    await tx
      .update(serviceOrders)
      .set({
        status: complete ? "complete" : "in_progress",
        details,
        result: { ...result, vetted, source: "vitu" },
        ...(complete
          ? { reviewedAt: new Date(), reviewNote: `Automated Vitu checks: ${notes.join(" · ")}` }
          : {}),
      })
      .where(eq(serviceOrders.id, o.id));
    if (complete && o.listingId && vetted)
      await tx.update(listings).set({ titleVetted: true }).where(eq(listings.id, o.listingId));
  }
  return stop;
}
