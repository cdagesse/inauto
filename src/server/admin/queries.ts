import "server-only";
import { and, count, desc, eq, ilike, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  adminActions,
  auctionResults,
  bids,
  dealerSales,
  garageCars,
  generations,
  listings,
  makes,
  modelAliases,
  models,
  serviceOrders,
  users,
} from "@/db/schema";
import { PAGE_SIZE } from "./rules";

const off = (page: number) => (page - 1) * PAGE_SIZE;

/* ---------------- dashboard ---------------- */

export async function dashboardStats() {
  const [userRows, listingRows, serviceRows, modelRows, reviewDealer, reviewAuction, recent] =
    await Promise.all([
      db.select({ status: users.status, n: count() }).from(users).groupBy(users.status),
      db.select({ status: listings.status, n: count() }).from(listings).groupBy(listings.status),
      db
        .select({ kind: serviceOrders.kind, status: serviceOrders.status, n: count() })
        .from(serviceOrders)
        .groupBy(serviceOrders.kind, serviceOrders.status),
      db
        .select({ status: models.reportStatus, n: count() })
        .from(models)
        .groupBy(models.reportStatus),
      db
        .select({ n: count() })
        .from(dealerSales)
        .where(or(eq(dealerSales.needsReview, true), isNotNull(dealerSales.excludedReason))),
      db
        .select({ n: count() })
        .from(auctionResults)
        .where(or(eq(auctionResults.needsReview, true), isNotNull(auctionResults.excludedReason))),
      recentActions(20),
    ]);
  const pending = (kind: string) =>
    serviceRows
      .filter((r) => r.kind === kind && (r.status === "requested" || r.status === "in_progress"))
      .reduce((a, r) => a + Number(r.n), 0);
  return {
    users: Object.fromEntries(userRows.map((r) => [r.status, Number(r.n)])) as Record<
      string,
      number
    >,
    listings: Object.fromEntries(listingRows.map((r) => [r.status, Number(r.n)])) as Record<
      string,
      number
    >,
    pendingTitle: pending("title_vetting"),
    pendingCondition: pending("condition_report"),
    reviewCount: Number(reviewDealer[0]?.n ?? 0) + Number(reviewAuction[0]?.n ?? 0),
    models: Object.fromEntries(modelRows.map((r) => [r.status, Number(r.n)])) as Record<
      string,
      number
    >,
    recent,
  };
}

/* ---------------- users ---------------- */

export async function listUsers(q: string, page: number) {
  const where = q ? or(ilike(users.email, `%${q}%`), ilike(users.name, `%${q}%`)) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        role: users.role,
        status: users.status,
        createdAt: users.createdAt,
        garageCount: sql<number>`(select count(*) from ${garageCars} where ${garageCars.userId} = ${users.id})`,
        listingCount: sql<number>`(select count(*) from ${listings} where ${listings.sellerId} = ${users.id})`,
      })
      .from(users)
      .where(where)
      .orderBy(desc(users.createdAt))
      .limit(PAGE_SIZE)
      .offset(off(page)),
    db.select({ n: count() }).from(users).where(where),
  ]);
  return { rows, total: Number(total[0]?.n ?? 0) };
}

export async function getUserDetail(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!user) return null;
  const [garage, userListings, orders, history] = await Promise.all([
    db
      .select()
      .from(garageCars)
      .where(eq(garageCars.userId, id))
      .orderBy(desc(garageCars.createdAt)),
    db
      .select({
        id: listings.id,
        title: listings.title,
        type: listings.type,
        status: listings.status,
        askingPrice: listings.askingPrice,
        createdAt: listings.createdAt,
        highBid: sql<
          number | null
        >`(select max(${bids.amount}) from ${bids} where ${bids.listingId} = ${listings.id})`,
      })
      .from(listings)
      .where(eq(listings.sellerId, id))
      .orderBy(desc(listings.createdAt))
      .limit(100),
    db
      .select()
      .from(serviceOrders)
      .where(eq(serviceOrders.userId, id))
      .orderBy(desc(serviceOrders.createdAt))
      .limit(100),
    db
      .select({
        id: adminActions.id,
        action: adminActions.action,
        details: adminActions.details,
        createdAt: adminActions.createdAt,
        adminEmail: users.email,
      })
      .from(adminActions)
      .leftJoin(users, eq(users.id, adminActions.adminId))
      .where(and(eq(adminActions.targetType, "user"), eq(adminActions.targetId, id)))
      .orderBy(desc(adminActions.createdAt))
      .limit(100),
  ]);
  return { user, garage, listings: userListings, orders, history };
}

/* ---------------- models ---------------- */

export async function listModelsAdmin(q: string) {
  const where = q ? ilike(models.searchText, `%${q}%`) : undefined;
  return db
    .select({
      id: models.id,
      name: models.name,
      slug: models.slug,
      makeName: makes.name,
      makeSlug: makes.slug,
      published: models.published,
      reportStatus: models.reportStatus,
      reportBuiltAt: models.reportBuiltAt,
      generationCount: sql<number>`(select count(*) from ${generations} where ${generations.modelId} = ${models.id})`,
      aliasCount: sql<number>`(select count(*) from ${modelAliases} where ${modelAliases.modelId} = ${models.id})`,
      dealerCount: sql<number>`(select count(*) from ${dealerSales} where ${dealerSales.modelId} = ${models.id})`,
      auctionCount: sql<number>`(select count(*) from ${auctionResults} where ${auctionResults.modelId} = ${models.id})`,
    })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(where)
    .orderBy(makes.name, models.name)
    .limit(500);
}

export async function getModelAdmin(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [row] = await db
    .select({ model: models, make: makes })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .where(eq(models.id, id))
    .limit(1);
  if (!row) return null;
  const [gens, aliases] = await Promise.all([
    db
      .select({
        g: generations,
        dealerCount: sql<number>`(select count(*) from ${dealerSales} where ${dealerSales.generationId} = ${generations.id})`,
        auctionCount: sql<number>`(select count(*) from ${auctionResults} where ${auctionResults.generationId} = ${generations.id})`,
      })
      .from(generations)
      .where(eq(generations.modelId, id))
      .orderBy(generations.sortOrder, generations.yearStart),
    db.select().from(modelAliases).where(eq(modelAliases.modelId, id)).orderBy(modelAliases.source),
  ]);
  return { ...row, generations: gens, aliases };
}

export async function listModelOptions() {
  return db
    .select({ id: models.id, name: models.name, makeName: makes.name })
    .from(models)
    .innerJoin(makes, eq(makes.id, models.makeId))
    .orderBy(makes.name, models.name)
    .limit(500);
}

export async function listGenerationOptions(modelId: string | null) {
  return db
    .select({
      id: generations.id,
      code: generations.code,
      name: generations.name,
      modelId: generations.modelId,
    })
    .from(generations)
    .where(modelId ? eq(generations.modelId, modelId) : undefined)
    .orderBy(generations.modelId, generations.sortOrder)
    .limit(1000);
}

/* ---------------- outlier review ---------------- */

export type ReviewFilter = {
  source: "dealer" | "auction";
  modelId?: string;
  generationId?: string;
  reason?: string; // needs_review | outlier_price | likely_mislabeled | incomplete | manual
  page: number;
};

function rawTrim(raw: unknown): string | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  for (const k of ["trim", "title", "name", "heading"]) {
    const v = r[k];
    if (typeof v === "string" && v.trim()) return v.trim().slice(0, 120);
  }
  return null;
}

export async function listReviewRows(f: ReviewFilter) {
  if (f.source === "dealer") {
    const t = dealerSales;
    const conds = [
      f.reason === "needs_review"
        ? eq(t.needsReview, true)
        : f.reason
          ? eq(t.excludedReason, f.reason as "manual")
          : or(eq(t.needsReview, true), isNotNull(t.excludedReason)),
    ];
    if (f.modelId) conds.push(eq(t.modelId, f.modelId));
    if (f.generationId) conds.push(eq(t.generationId, f.generationId));
    const where = and(...conds);
    const [rows, total] = await Promise.all([
      db
        .select({
          id: t.id,
          modelId: t.modelId,
          generationId: t.generationId,
          generationCode: generations.code,
          year: t.year,
          miles: t.miles,
          price: t.price,
          color: t.color,
          dealerName: t.dealerName,
          state: t.state,
          date: t.soldDate,
          needsReview: t.needsReview,
          excludedReason: t.excludedReason,
          rawJson: t.rawJson,
          url: sql<string | null>`null`,
          platform: sql<string | null>`null`,
        })
        .from(t)
        .leftJoin(generations, eq(generations.id, t.generationId))
        .where(where)
        .orderBy(desc(t.fetchedAt))
        .limit(PAGE_SIZE)
        .offset(off(f.page)),
      db.select({ n: count() }).from(t).where(where),
    ]);
    return {
      rows: rows.map((r) => ({ ...r, rawTrim: rawTrim(r.rawJson), rawJson: undefined })),
      total: Number(total[0]?.n ?? 0),
    };
  }
  const t = auctionResults;
  const conds = [
    f.reason === "needs_review"
      ? eq(t.needsReview, true)
      : f.reason
        ? eq(t.excludedReason, f.reason as "manual")
        : or(eq(t.needsReview, true), isNotNull(t.excludedReason)),
  ];
  if (f.modelId) conds.push(eq(t.modelId, f.modelId));
  if (f.generationId) conds.push(eq(t.generationId, f.generationId));
  const where = and(...conds);
  const [rows, total] = await Promise.all([
    db
      .select({
        id: t.id,
        modelId: t.modelId,
        generationId: t.generationId,
        generationCode: generations.code,
        year: t.year,
        miles: t.miles,
        price: t.hammerPrice,
        color: sql<string | null>`null`,
        dealerName: sql<string | null>`null`,
        state: sql<string | null>`null`,
        date: sql<string | null>`to_char(${t.endedAt}, 'YYYY-MM-DD')`,
        needsReview: t.needsReview,
        excludedReason: t.excludedReason,
        rawJson: t.rawJson,
        url: t.url,
        platform: t.source,
      })
      .from(t)
      .leftJoin(generations, eq(generations.id, t.generationId))
      .where(where)
      .orderBy(desc(t.fetchedAt))
      .limit(PAGE_SIZE)
      .offset(off(f.page)),
    db.select({ n: count() }).from(t).where(where),
  ]);
  return {
    rows: rows.map((r) => ({ ...r, rawTrim: rawTrim(r.rawJson), rawJson: undefined })),
    total: Number(total[0]?.n ?? 0),
  };
}

/* ---------------- service orders ---------------- */

export async function listServiceQueue(
  kind: "title_vetting" | "condition_report",
  showClosed: boolean,
  page: number,
) {
  const where = showClosed
    ? eq(serviceOrders.kind, kind)
    : and(
        eq(serviceOrders.kind, kind),
        or(eq(serviceOrders.status, "requested"), eq(serviceOrders.status, "in_progress")),
      );
  const [rows, total] = await Promise.all([
    db
      .select({
        order: serviceOrders,
        requesterEmail: users.email,
        requesterName: users.name,
        listingTitle: listings.title,
        listingVin: listings.vin,
        listingTitleVetted: listings.titleVetted,
      })
      .from(serviceOrders)
      .innerJoin(users, eq(users.id, serviceOrders.userId))
      .leftJoin(listings, eq(listings.id, serviceOrders.listingId))
      .where(where)
      .orderBy(serviceOrders.createdAt)
      .limit(PAGE_SIZE)
      .offset(off(page)),
    db.select({ n: count() }).from(serviceOrders).where(where),
  ]);
  return { rows, total: Number(total[0]?.n ?? 0) };
}

/* ---------------- audit ---------------- */

export async function recentActions(limit: number) {
  return db
    .select({
      id: adminActions.id,
      action: adminActions.action,
      targetType: adminActions.targetType,
      targetId: adminActions.targetId,
      details: adminActions.details,
      createdAt: adminActions.createdAt,
      adminEmail: users.email,
    })
    .from(adminActions)
    .leftJoin(users, eq(users.id, adminActions.adminId))
    .orderBy(desc(adminActions.createdAt))
    .limit(limit);
}

export async function listAudit(f: { action?: string; targetType?: string; page: number }) {
  const conds = [];
  if (f.action) conds.push(ilike(adminActions.action, `${f.action}%`));
  if (f.targetType) conds.push(eq(adminActions.targetType, f.targetType));
  const where = conds.length ? and(...conds) : undefined;
  const [rows, total] = await Promise.all([
    db
      .select({
        id: adminActions.id,
        action: adminActions.action,
        targetType: adminActions.targetType,
        targetId: adminActions.targetId,
        details: adminActions.details,
        createdAt: adminActions.createdAt,
        adminEmail: users.email,
      })
      .from(adminActions)
      .leftJoin(users, eq(users.id, adminActions.adminId))
      .where(where)
      .orderBy(desc(adminActions.createdAt))
      .limit(PAGE_SIZE)
      .offset(off(f.page)),
    db.select({ n: count() }).from(adminActions).where(where),
  ]);
  return { rows, total: Number(total[0]?.n ?? 0) };
}
