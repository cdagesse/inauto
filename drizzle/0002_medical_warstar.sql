CREATE TYPE "public"."external_listing_status" AS ENUM('live', 'sold', 'rnm', 'withdrawn', 'ended');--> statement-breakpoint
CREATE TABLE "external_listing" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_name" text NOT NULL,
	"source_id" text NOT NULL,
	"url" text NOT NULL,
	"status" "external_listing_status" DEFAULT 'live' NOT NULL,
	"title" text NOT NULL,
	"make" text,
	"model" text,
	"year" integer,
	"trim" text,
	"vin" text,
	"miles" integer,
	"color" text,
	"location" text,
	"description" text,
	"photo_urls" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"current_bid" integer,
	"bid_count" integer,
	"reserve_met" boolean,
	"final_price" integer,
	"started_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"model_id" text,
	"generation_id" text,
	"raw_json" jsonb,
	"fetched_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "outbound_click" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"external_listing_id" text NOT NULL,
	"user_id" text,
	"ip_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "external_listing" ADD CONSTRAINT "external_listing_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "external_listing" ADD CONSTRAINT "external_listing_generation_id_generation_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generation"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_click" ADD CONSTRAINT "outbound_click_external_listing_id_external_listing_id_fk" FOREIGN KEY ("external_listing_id") REFERENCES "public"."external_listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "outbound_click" ADD CONSTRAINT "outbound_click_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "external_listing_source_idx" ON "external_listing" USING btree ("source","source_id");--> statement-breakpoint
CREATE INDEX "external_listing_status_ends_idx" ON "external_listing" USING btree ("status","ends_at");--> statement-breakpoint
CREATE INDEX "external_listing_model_idx" ON "external_listing" USING btree ("model_id","status");--> statement-breakpoint
CREATE INDEX "outbound_click_listing_idx" ON "outbound_click" USING btree ("external_listing_id","created_at");