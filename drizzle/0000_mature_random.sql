CREATE TYPE "public"."auction_status" AS ENUM('sold', 'rnm', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."market_channel" AS ENUM('dealer', 'auction');--> statement-breakpoint
CREATE TYPE "public"."excluded_reason" AS ENUM('outlier_price', 'likely_mislabeled', 'incomplete', 'manual');--> statement-breakpoint
CREATE TYPE "public"."garage_status" AS ENUM('wishlist', 'owned', 'previous');--> statement-breakpoint
CREATE TYPE "public"."listing_status" AS ENUM('draft', 'active', 'ended', 'sold', 'withdrawn');--> statement-breakpoint
CREATE TYPE "public"."listing_type" AS ENUM('classified', 'auction', 'private');--> statement-breakpoint
CREATE TYPE "public"."network_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."service_kind" AS ENUM('title_vetting', 'condition_report', 'escrow');--> statement-breakpoint
CREATE TYPE "public"."service_status" AS ENUM('requested', 'in_progress', 'complete', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('user', 'dealer', 'admin');--> statement-breakpoint
CREATE TABLE "account" (
	"user_id" text NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text,
	CONSTRAINT "account_provider_provider_account_id_pk" PRIMARY KEY("provider","provider_account_id")
);
--> statement-breakpoint
CREATE TABLE "api_budget" (
	"source" text NOT NULL,
	"month" text NOT NULL,
	"calls_used" integer DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_budget_source_month_pk" PRIMARY KEY("source","month")
);
--> statement-breakpoint
CREATE TABLE "auction_result" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text NOT NULL,
	"url" text,
	"vin" text,
	"generation_id" text,
	"model_id" text NOT NULL,
	"year" integer,
	"miles" integer,
	"hammer_price" integer,
	"status" "auction_status" NOT NULL,
	"ended_at" timestamp with time zone,
	"packages" text[] DEFAULT '{}'::text[] NOT NULL,
	"excluded_reason" "excluded_reason",
	"needs_review" boolean DEFAULT false NOT NULL,
	"raw_json" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bid" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" text NOT NULL,
	"bidder_id" text NOT NULL,
	"amount" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_active" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_listing_id" text NOT NULL,
	"vin" text,
	"generation_id" text,
	"model_id" text NOT NULL,
	"year" integer,
	"miles" integer,
	"price" integer,
	"color" text,
	"is_pts" boolean DEFAULT false NOT NULL,
	"packages" text[] DEFAULT '{}'::text[] NOT NULL,
	"dealer_name" text,
	"state" text,
	"days_on_market" integer,
	"excluded_reason" "excluded_reason",
	"needs_review" boolean DEFAULT false NOT NULL,
	"raw_json" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"snapshot_date" date NOT NULL
);
--> statement-breakpoint
CREATE TABLE "dealer_sale" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_listing_id" text NOT NULL,
	"vin" text,
	"generation_id" text,
	"model_id" text NOT NULL,
	"year" integer,
	"miles" integer,
	"price" integer,
	"color" text,
	"is_pts" boolean DEFAULT false NOT NULL,
	"packages" text[] DEFAULT '{}'::text[] NOT NULL,
	"dealer_name" text,
	"state" text,
	"days_on_market" integer,
	"excluded_reason" "excluded_reason",
	"needs_review" boolean DEFAULT false NOT NULL,
	"raw_json" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sold_date" date
);
--> statement-breakpoint
CREATE TABLE "garage_car" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"status" "garage_status" NOT NULL,
	"model_id" text,
	"generation_id" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"trim" text,
	"vin" text,
	"miles" integer,
	"color" text,
	"nickname" text,
	"notes" text,
	"purchase_price" integer,
	"sale_price" integer,
	"acquired_at" date,
	"sold_at" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "generation" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"year_start" integer NOT NULL,
	"year_end" integer NOT NULL,
	"original_msrp" integer,
	"engine" text,
	"hp" text,
	"gearbox" text,
	"notes" text,
	"packages" text[] DEFAULT '{}'::text[] NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "job_run" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"ok" boolean,
	"dry_run" boolean DEFAULT true NOT NULL,
	"summary" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "listing" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_id" text NOT NULL,
	"type" "listing_type" NOT NULL,
	"status" "listing_status" DEFAULT 'draft' NOT NULL,
	"network_id" text,
	"model_id" text,
	"generation_id" text,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer NOT NULL,
	"trim" text,
	"vin" text,
	"miles" integer NOT NULL,
	"color" text,
	"color_class" text DEFAULT 'std' NOT NULL,
	"condition" text DEFAULT 'ex' NOT NULL,
	"history" text DEFAULT 'clean' NOT NULL,
	"packages" text[] DEFAULT '{}'::text[] NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"location" text,
	"asking_price" integer,
	"reserve_price" integer,
	"auction_ends_at" timestamp with time zone,
	"price_guidance" jsonb,
	"title_vetted" boolean DEFAULT false NOT NULL,
	"condition_report_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "make" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	CONSTRAINT "make_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "market_daily" (
	"generation_id" text NOT NULL,
	"date" date NOT NULL,
	"channel" "market_channel" NOT NULL,
	"n" integer NOT NULL,
	"median" integer,
	"p25" integer,
	"p75" integer,
	"median_miles" integer,
	CONSTRAINT "market_daily_generation_id_date_channel_pk" PRIMARY KEY("generation_id","date","channel")
);
--> statement-breakpoint
CREATE TABLE "model_alias" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"model_id" text NOT NULL,
	"source" text NOT NULL,
	"raw_make" text NOT NULL,
	"raw_model" text NOT NULL,
	"raw_trim_pattern" text
);
--> statement-breakpoint
CREATE TABLE "model" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"make_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"short_name" text,
	"published" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "network_invite" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"network_id" text NOT NULL,
	"invited_by" text NOT NULL,
	"email" text,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"accepted_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_invite_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "network_member" (
	"network_id" text NOT NULL,
	"user_id" text NOT NULL,
	"role" "network_role" DEFAULT 'member' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_member_network_id_user_id_pk" PRIMARY KEY("network_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "network" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" text NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "network_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "raw_fetch" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"endpoint" text NOT NULL,
	"params" jsonb NOT NULL,
	"status" integer NOT NULL,
	"rate_limit_headers" jsonb,
	"body" jsonb,
	"row_count" integer,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"processed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "service_order" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" text,
	"kind" "service_kind" NOT NULL,
	"status" "service_status" DEFAULT 'requested' NOT NULL,
	"vin" text,
	"details" jsonb,
	"result" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "session" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"expires" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text,
	"email" text,
	"email_verified" timestamp,
	"image" text,
	"role" "user_role" DEFAULT 'user' NOT NULL,
	"handle" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_email_unique" UNIQUE("email"),
	CONSTRAINT "user_handle_unique" UNIQUE("handle")
);
--> statement-breakpoint
CREATE TABLE "valuation_config" (
	"key" text NOT NULL,
	"scope" text DEFAULT 'global' NOT NULL,
	"value" numeric(14, 6) NOT NULL,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "valuation_config_key_scope_pk" PRIMARY KEY("key","scope")
);
--> statement-breakpoint
CREATE TABLE "valuation_request" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" text,
	"model_slug" text NOT NULL,
	"generation_code" text NOT NULL,
	"inputs" jsonb NOT NULL,
	"outputs" jsonb NOT NULL,
	"contact_email" text,
	"ip_hash" text
);
--> statement-breakpoint
CREATE TABLE "verification_token" (
	"identifier" text NOT NULL,
	"token" text NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_token_identifier_token_pk" PRIMARY KEY("identifier","token")
);
--> statement-breakpoint
ALTER TABLE "account" ADD CONSTRAINT "account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_result" ADD CONSTRAINT "auction_result_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auction_result" ADD CONSTRAINT "auction_result_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bid" ADD CONSTRAINT "bid_bidder_id_user_id_fk" FOREIGN KEY ("bidder_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_active" ADD CONSTRAINT "dealer_active_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_active" ADD CONSTRAINT "dealer_active_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_sale" ADD CONSTRAINT "dealer_sale_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dealer_sale" ADD CONSTRAINT "dealer_sale_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garage_car" ADD CONSTRAINT "garage_car_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garage_car" ADD CONSTRAINT "garage_car_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "garage_car" ADD CONSTRAINT "garage_car_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation" ADD CONSTRAINT "generation_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_network_id_network_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."network"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "listing" ADD CONSTRAINT "listing_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_daily" ADD CONSTRAINT "market_daily_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model_alias" ADD CONSTRAINT "model_alias_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "model" ADD CONSTRAINT "model_make_id_make_id_fk" FOREIGN KEY ("make_id") REFERENCES "public"."make"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_invite" ADD CONSTRAINT "network_invite_network_id_network_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."network"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_invite" ADD CONSTRAINT "network_invite_invited_by_user_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_invite" ADD CONSTRAINT "network_invite_accepted_by_user_id_fk" FOREIGN KEY ("accepted_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_member" ADD CONSTRAINT "network_member_network_id_network_id_fk" FOREIGN KEY ("network_id") REFERENCES "public"."network"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network_member" ADD CONSTRAINT "network_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "network" ADD CONSTRAINT "network_owner_id_user_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "valuation_request" ADD CONSTRAINT "valuation_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "auction_result_source_idx" ON "auction_result" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "auction_result_gen_ended_idx" ON "auction_result" USING btree ("generation_id","ended_at");--> statement-breakpoint
CREATE INDEX "bid_listing_amount_idx" ON "bid" USING btree ("listing_id","amount");--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_active_source_day_idx" ON "dealer_active" USING btree ("source_listing_id","snapshot_date");--> statement-breakpoint
CREATE INDEX "dealer_active_gen_day_idx" ON "dealer_active" USING btree ("generation_id","snapshot_date");--> statement-breakpoint
CREATE UNIQUE INDEX "dealer_sale_source_idx" ON "dealer_sale" USING btree ("source_listing_id");--> statement-breakpoint
CREATE INDEX "dealer_sale_gen_date_idx" ON "dealer_sale" USING btree ("generation_id","sold_date");--> statement-breakpoint
CREATE INDEX "dealer_sale_model_idx" ON "dealer_sale" USING btree ("model_id");--> statement-breakpoint
CREATE INDEX "garage_car_user_status_idx" ON "garage_car" USING btree ("user_id","status");--> statement-breakpoint
CREATE UNIQUE INDEX "generation_model_code_idx" ON "generation" USING btree ("model_id","code");--> statement-breakpoint
CREATE INDEX "listing_status_type_idx" ON "listing" USING btree ("status","type","created_at");--> statement-breakpoint
CREATE INDEX "listing_seller_idx" ON "listing" USING btree ("seller_id");--> statement-breakpoint
CREATE INDEX "listing_network_idx" ON "listing" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "model_alias_model_idx" ON "model_alias" USING btree ("model_id");--> statement-breakpoint
CREATE UNIQUE INDEX "model_make_slug_idx" ON "model" USING btree ("make_id","slug");--> statement-breakpoint
CREATE INDEX "network_invite_network_idx" ON "network_invite" USING btree ("network_id");--> statement-breakpoint
CREATE INDEX "network_member_user_idx" ON "network_member" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "raw_fetch_source_time_idx" ON "raw_fetch" USING btree ("source","fetched_at");--> statement-breakpoint
CREATE INDEX "service_order_user_idx" ON "service_order" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "valuation_request_created_idx" ON "valuation_request" USING btree ("created_at");