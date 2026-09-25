CREATE TYPE "public"."report_status" AS ENUM('none', 'requested', 'building', 'ready', 'failed');--> statement-breakpoint
CREATE TYPE "public"."user_status" AS ENUM('active', 'disabled', 'blocked');--> statement-breakpoint
ALTER TYPE "public"."service_status" ADD VALUE 'declined';--> statement-breakpoint
CREATE TABLE "admin_action" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_id" text NOT NULL,
	"action" text NOT NULL,
	"target_type" text NOT NULL,
	"target_id" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "closed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "winning_bid_id" text;--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "sold_price" integer;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "parent_line" text;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "year_start" integer;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "year_end" integer;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "report_status" "report_status" DEFAULT 'none' NOT NULL;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "report_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "report_built_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "report_error" text;--> statement-breakpoint
ALTER TABLE "model" ADD COLUMN "search_text" text;--> statement-breakpoint
ALTER TABLE "service_order" ADD COLUMN "reviewer_id" text;--> statement-breakpoint
ALTER TABLE "service_order" ADD COLUMN "reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "service_order" ADD COLUMN "review_note" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status" "user_status" DEFAULT 'active' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status_reason" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "status_changed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_action" ADD CONSTRAINT "admin_action_admin_id_user_id_fk" FOREIGN KEY ("admin_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_action_target_idx" ON "admin_action" USING btree ("target_type","target_id");--> statement-breakpoint
ALTER TABLE "service_order" ADD CONSTRAINT "service_order_reviewer_id_user_id_fk" FOREIGN KEY ("reviewer_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "model_search_idx" ON "model" USING btree ("search_text");--> statement-breakpoint
CREATE INDEX "model_report_status_idx" ON "model" USING btree ("report_status");--> statement-breakpoint
CREATE INDEX "service_order_kind_status_idx" ON "service_order" USING btree ("kind","status","created_at");