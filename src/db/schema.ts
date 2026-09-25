import { relations, sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import type { AdapterAccountType } from "next-auth/adapters";

const id = () =>
  text("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

/* ------------------------------------------------------------------ */
/* Auth.js                                                             */
/* ------------------------------------------------------------------ */

export const userRole = pgEnum("user_role", ["user", "dealer", "admin"]);
/** active: normal. disabled: cannot sign in or act (soft off switch). blocked: banned; listings hidden. */
export const userStatus = pgEnum("user_status", ["active", "disabled", "blocked"]);

export const users = pgTable("user", {
  id: id(),
  name: text("name"),
  email: text("email").unique(),
  emailVerified: timestamp("email_verified", { mode: "date" }),
  image: text("image"),
  role: userRole("role").notNull().default("user"),
  status: userStatus("status").notNull().default("active"),
  statusReason: text("status_reason"),
  statusChangedAt: timestamp("status_changed_at", { withTimezone: true }),
  handle: text("handle").unique(),
  createdAt: createdAt(),
});

export const accounts = pgTable(
  "account",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: text("type").$type<AdapterAccountType>().notNull(),
    provider: text("provider").notNull(),
    providerAccountId: text("provider_account_id").notNull(),
    refresh_token: text("refresh_token"),
    access_token: text("access_token"),
    expires_at: integer("expires_at"),
    token_type: text("token_type"),
    scope: text("scope"),
    id_token: text("id_token"),
    session_state: text("session_state"),
  },
  (t) => [primaryKey({ columns: [t.provider, t.providerAccountId] })],
);

export const sessions = pgTable("session", {
  sessionToken: text("session_token").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expires: timestamp("expires", { mode: "date" }).notNull(),
});

export const verificationTokens = pgTable(
  "verification_token",
  {
    identifier: text("identifier").notNull(),
    token: text("token").notNull(),
    expires: timestamp("expires", { mode: "date" }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.identifier, t.token] })],
);

/* ------------------------------------------------------------------ */
/* Catalog: make / model / generation                                  */
/* ------------------------------------------------------------------ */

export const makes = pgTable("make", {
  id: id(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
});

/** none: catalog entry only. requested: a visitor asked for a report. building: job running. ready: data present. failed: see reportError. */
export const reportStatus = pgEnum("report_status", [
  "none",
  "requested",
  "building",
  "ready",
  "failed",
]);

export const models = pgTable(
  "model",
  {
    id: id(),
    makeId: text("make_id")
      .notNull()
      .references(() => makes.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    shortName: text("short_name"),
    /** Parent line shown above the model name, e.g. "Porsche 911" or "Mercedes-AMG". */
    parentLine: text("parent_line"),
    yearStart: integer("year_start"),
    yearEnd: integer("year_end"),
    published: boolean("published").notNull().default(false),
    reportStatus: reportStatus("report_status").notNull().default("none"),
    reportRequestedAt: timestamp("report_requested_at", { withTimezone: true }),
    reportBuiltAt: timestamp("report_built_at", { withTimezone: true }),
    reportError: text("report_error"),
    searchText: text("search_text"),
  },
  (t) => [
    uniqueIndex("model_make_slug_idx").on(t.makeId, t.slug),
    index("model_search_idx").on(t.searchText),
    index("model_report_status_idx").on(t.reportStatus),
  ],
);

export const generations = pgTable(
  "generation",
  {
    id: id(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    code: text("code").notNull(),
    name: text("name").notNull(),
    yearStart: integer("year_start").notNull(),
    yearEnd: integer("year_end").notNull(),
    originalMsrp: integer("original_msrp"),
    engine: text("engine"),
    hp: text("hp"),
    gearbox: text("gearbox"),
    notes: text("notes"),
    packages: text("packages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    sortOrder: integer("sort_order").notNull().default(0),
  },
  (t) => [uniqueIndex("generation_model_code_idx").on(t.modelId, t.code)],
);

export const modelAliases = pgTable(
  "model_alias",
  {
    id: id(),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    source: text("source").notNull(), // visor | ocd
    rawMake: text("raw_make").notNull(),
    rawModel: text("raw_model").notNull(),
    rawTrimPattern: text("raw_trim_pattern"),
  },
  (t) => [index("model_alias_model_idx").on(t.modelId)],
);

/* ------------------------------------------------------------------ */
/* Market data                                                         */
/* ------------------------------------------------------------------ */

export const excludedReason = pgEnum("excluded_reason", [
  "outlier_price",
  "likely_mislabeled",
  "incomplete",
  "manual",
]);
export const auctionStatus = pgEnum("auction_status", ["sold", "rnm", "withdrawn"]);
export const channel = pgEnum("market_channel", ["dealer", "auction"]);

const dealerColumns = {
  id: id(),
  sourceListingId: text("source_listing_id").notNull(),
  vin: text("vin"),
  generationId: text("generation_id").references(() => generations.id, { onDelete: "set null" }),
  modelId: text("model_id")
    .notNull()
    .references(() => models.id, { onDelete: "cascade" }),
  year: integer("year"),
  miles: integer("miles"),
  price: integer("price"),
  color: text("color"),
  isPts: boolean("is_pts").notNull().default(false),
  packages: text("packages")
    .array()
    .notNull()
    .default(sql`'{}'::text[]`),
  dealerName: text("dealer_name"),
  state: text("state"),
  daysOnMarket: integer("days_on_market"),
  excludedReason: excludedReason("excluded_reason"),
  needsReview: boolean("needs_review").notNull().default(false),
  rawJson: jsonb("raw_json"),
  fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
};

export const dealerSales = pgTable(
  "dealer_sale",
  { ...dealerColumns, soldDate: date("sold_date") },
  (t) => [
    uniqueIndex("dealer_sale_source_idx").on(t.sourceListingId),
    index("dealer_sale_gen_date_idx").on(t.generationId, t.soldDate),
    index("dealer_sale_model_idx").on(t.modelId),
  ],
);

export const dealerActive = pgTable(
  "dealer_active",
  { ...dealerColumns, snapshotDate: date("snapshot_date").notNull() },
  (t) => [
    uniqueIndex("dealer_active_source_day_idx").on(t.sourceListingId, t.snapshotDate),
    index("dealer_active_gen_day_idx").on(t.generationId, t.snapshotDate),
  ],
);

export const auctionResults = pgTable(
  "auction_result",
  {
    id: id(),
    source: text("source").notNull(), // platform name
    sourceId: text("source_id").notNull(),
    url: text("url"),
    vin: text("vin"),
    generationId: text("generation_id").references(() => generations.id, { onDelete: "set null" }),
    modelId: text("model_id")
      .notNull()
      .references(() => models.id, { onDelete: "cascade" }),
    year: integer("year"),
    miles: integer("miles"),
    hammerPrice: integer("hammer_price"),
    status: auctionStatus("status").notNull(),
    endedAt: timestamp("ended_at", { withTimezone: true }),
    packages: text("packages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    excludedReason: excludedReason("excluded_reason"),
    needsReview: boolean("needs_review").notNull().default(false),
    rawJson: jsonb("raw_json"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("auction_result_source_idx").on(t.source, t.sourceId),
    index("auction_result_gen_ended_idx").on(t.generationId, t.endedAt),
  ],
);

export const marketDaily = pgTable(
  "market_daily",
  {
    generationId: text("generation_id")
      .notNull()
      .references(() => generations.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    channel: channel("channel").notNull(),
    n: integer("n").notNull(),
    median: integer("median"),
    p25: integer("p25"),
    p75: integer("p75"),
    medianMiles: integer("median_miles"),
  },
  (t) => [primaryKey({ columns: [t.generationId, t.date, t.channel] })],
);

export const valuationConfig = pgTable(
  "valuation_config",
  {
    key: text("key").notNull(),
    scope: text("scope").notNull().default("global"), // global | model:<slug> | gen:<code>
    value: numeric("value", { precision: 14, scale: 6 }).notNull(),
    note: text("note"),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.key, t.scope] })],
);

export const valuationRequests = pgTable(
  "valuation_request",
  {
    id: id(),
    createdAt: createdAt(),
    userId: text("user_id").references(() => users.id, { onDelete: "set null" }),
    modelSlug: text("model_slug").notNull(),
    generationCode: text("generation_code").notNull(),
    inputs: jsonb("inputs").notNull(),
    outputs: jsonb("outputs").notNull(),
    contactEmail: text("contact_email"),
    ipHash: text("ip_hash"),
  },
  (t) => [index("valuation_request_created_idx").on(t.createdAt)],
);

/** Raw third-party responses, stored before normalization so we can reprocess without re-spending API calls. */
export const rawFetches = pgTable(
  "raw_fetch",
  {
    id: id(),
    source: text("source").notNull(), // visor | ocd
    endpoint: text("endpoint").notNull(),
    params: jsonb("params").notNull(),
    status: integer("status").notNull(),
    rateLimitHeaders: jsonb("rate_limit_headers"),
    body: jsonb("body"),
    rowCount: integer("row_count"),
    fetchedAt: timestamp("fetched_at", { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp("processed_at", { withTimezone: true }),
  },
  (t) => [index("raw_fetch_source_time_idx").on(t.source, t.fetchedAt)],
);

/** Calls consumed per source per calendar month; jobs stop cleanly at the configured budget. */
export const apiBudgets = pgTable(
  "api_budget",
  {
    source: text("source").notNull(),
    month: text("month").notNull(), // YYYY-MM
    callsUsed: integer("calls_used").notNull().default(0),
    updatedAt: updatedAt(),
  },
  (t) => [primaryKey({ columns: [t.source, t.month] })],
);

export const jobRuns = pgTable("job_run", {
  id: id(),
  name: text("name").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  ok: boolean("ok"),
  dryRun: boolean("dry_run").notNull().default(true),
  summary: jsonb("summary"),
  error: text("error"),
});

/* ------------------------------------------------------------------ */
/* Marketplace: listings, auctions, private networks                   */
/* ------------------------------------------------------------------ */

export const listingType = pgEnum("listing_type", ["classified", "auction", "private"]);
export const listingStatus = pgEnum("listing_status", [
  "draft",
  "active",
  "ended",
  "sold",
  "withdrawn",
]);

/** Append-only audit trail for admin actions. */
export const adminActions = pgTable(
  "admin_action",
  {
    id: id(),
    adminId: text("admin_id")
      .notNull()
      .references(() => users.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id").notNull(),
    details: jsonb("details"),
    createdAt: createdAt(),
  },
  (t) => [index("admin_action_target_idx").on(t.targetType, t.targetId)],
);

export const networks = pgTable("network", {
  id: id(),
  ownerId: text("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  description: text("description"),
  createdAt: createdAt(),
});

export const networkRole = pgEnum("network_role", ["owner", "member"]);

export const networkMembers = pgTable(
  "network_member",
  {
    networkId: text("network_id")
      .notNull()
      .references(() => networks.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: networkRole("role").notNull().default("member"),
    joinedAt: createdAt(),
  },
  (t) => [
    primaryKey({ columns: [t.networkId, t.userId] }),
    index("network_member_user_idx").on(t.userId),
  ],
);

export const networkInvites = pgTable(
  "network_invite",
  {
    id: id(),
    networkId: text("network_id")
      .notNull()
      .references(() => networks.id, { onDelete: "cascade" }),
    invitedBy: text("invited_by")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    email: text("email"),
    tokenHash: text("token_hash").notNull().unique(), // sha256 of the invite token; the token itself is only ever in the link
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    acceptedBy: text("accepted_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
  },
  (t) => [index("network_invite_network_idx").on(t.networkId)],
);

export const listings = pgTable(
  "listing",
  {
    id: id(),
    sellerId: text("seller_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    type: listingType("type").notNull(),
    status: listingStatus("status").notNull().default("draft"),
    networkId: text("network_id").references(() => networks.id, { onDelete: "set null" }),
    modelId: text("model_id").references(() => models.id, { onDelete: "set null" }),
    generationId: text("generation_id").references(() => generations.id, { onDelete: "set null" }),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year").notNull(),
    trim: text("trim"),
    vin: text("vin"),
    miles: integer("miles").notNull(),
    color: text("color"),
    colorClass: text("color_class").notNull().default("std"),
    condition: text("condition").notNull().default("ex"),
    history: text("history").notNull().default("clean"),
    packages: text("packages")
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    title: text("title").notNull(),
    description: text("description"),
    photos: jsonb("photos")
      .$type<string[]>()
      .notNull()
      .default(sql`'[]'::jsonb`),
    location: text("location"),
    askingPrice: integer("asking_price"),
    reservePrice: integer("reserve_price"),
    auctionEndsAt: timestamp("auction_ends_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    winningBidId: text("winning_bid_id"),
    soldPrice: integer("sold_price"),
    /** Snapshot of the pricing guidance shown at listing time (market value, verdict, comps). */
    priceGuidance: jsonb("price_guidance"),
    titleVetted: boolean("title_vetted").notNull().default(false),
    conditionReportId: text("condition_report_id"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("listing_status_type_idx").on(t.status, t.type, t.createdAt),
    index("listing_seller_idx").on(t.sellerId),
    index("listing_network_idx").on(t.networkId),
  ],
);

export const bids = pgTable(
  "bid",
  {
    id: id(),
    listingId: text("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    bidderId: text("bidder_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    amount: integer("amount").notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("bid_listing_amount_idx").on(t.listingId, t.amount)],
);

/* ------------------------------------------------------------------ */
/* Garage                                                              */
/* ------------------------------------------------------------------ */

export const garageStatus = pgEnum("garage_status", ["wishlist", "owned", "previous"]);

export const garageCars = pgTable(
  "garage_car",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: garageStatus("status").notNull(),
    modelId: text("model_id").references(() => models.id, { onDelete: "set null" }),
    generationId: text("generation_id").references(() => generations.id, { onDelete: "set null" }),
    make: text("make").notNull(),
    model: text("model").notNull(),
    year: integer("year"),
    trim: text("trim"),
    vin: text("vin"),
    miles: integer("miles"),
    color: text("color"),
    nickname: text("nickname"),
    notes: text("notes"),
    purchasePrice: integer("purchase_price"),
    salePrice: integer("sale_price"),
    acquiredAt: date("acquired_at"),
    soldAt: date("sold_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("garage_car_user_status_idx").on(t.userId, t.status)],
);

/* ------------------------------------------------------------------ */
/* Buyer protection services                                           */
/* ------------------------------------------------------------------ */

export const serviceKind = pgEnum("service_kind", ["title_vetting", "condition_report", "escrow"]);
export const serviceStatus = pgEnum("service_status", [
  "requested",
  "in_progress",
  "complete",
  "cancelled",
  "declined",
]);

export const serviceOrders = pgTable(
  "service_order",
  {
    id: id(),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    listingId: text("listing_id").references(() => listings.id, { onDelete: "set null" }),
    kind: serviceKind("kind").notNull(),
    status: serviceStatus("status").notNull().default("requested"),
    vin: text("vin"),
    details: jsonb("details"),
    result: jsonb("result"),
    reviewerId: text("reviewer_id").references(() => users.id, { onDelete: "set null" }),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNote: text("review_note"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    index("service_order_user_idx").on(t.userId, t.createdAt),
    index("service_order_kind_status_idx").on(t.kind, t.status, t.createdAt),
  ],
);

/* ------------------------------------------------------------------ */
/* Relations                                                           */
/* ------------------------------------------------------------------ */

export const makesRelations = relations(makes, ({ many }) => ({ models: many(models) }));
export const modelsRelations = relations(models, ({ one, many }) => ({
  make: one(makes, { fields: [models.makeId], references: [makes.id] }),
  generations: many(generations),
  aliases: many(modelAliases),
}));
export const generationsRelations = relations(generations, ({ one }) => ({
  model: one(models, { fields: [generations.modelId], references: [models.id] }),
}));
export const listingsRelations = relations(listings, ({ one, many }) => ({
  seller: one(users, { fields: [listings.sellerId], references: [users.id] }),
  network: one(networks, { fields: [listings.networkId], references: [networks.id] }),
  bids: many(bids),
}));
export const bidsRelations = relations(bids, ({ one }) => ({
  listing: one(listings, { fields: [bids.listingId], references: [listings.id] }),
  bidder: one(users, { fields: [bids.bidderId], references: [users.id] }),
}));
export const networksRelations = relations(networks, ({ one, many }) => ({
  owner: one(users, { fields: [networks.ownerId], references: [users.id] }),
  members: many(networkMembers),
  listings: many(listings),
}));
export const networkMembersRelations = relations(networkMembers, ({ one }) => ({
  network: one(networks, { fields: [networkMembers.networkId], references: [networks.id] }),
  user: one(users, { fields: [networkMembers.userId], references: [users.id] }),
}));
export const garageCarsRelations = relations(garageCars, ({ one }) => ({
  user: one(users, { fields: [garageCars.userId], references: [users.id] }),
}));
