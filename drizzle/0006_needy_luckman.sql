CREATE TYPE "public"."purchase_mode" AS ENUM('in_person', 'online');--> statement-breakpoint
CREATE TYPE "public"."purchase_status" AS ENUM('submitted', 'accepted', 'declined', 'cancelled', 'completed');--> statement-breakpoint
CREATE TABLE "inquiry" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"message" text NOT NULL,
	"contact" text,
	"read_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "purchase" (
	"id" text PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"listing_id" text NOT NULL,
	"buyer_id" text NOT NULL,
	"seller_id" text NOT NULL,
	"mode" "purchase_mode" NOT NULL,
	"status" "purchase_status" DEFAULT 'submitted' NOT NULL,
	"price" integer NOT NULL,
	"buyer" jsonb NOT NULL,
	"options" jsonb NOT NULL,
	"uploads" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"cart" jsonb NOT NULL,
	"note" text,
	"seller_note" text,
	"responded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "listing" ADD COLUMN "seller_details" jsonb;--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inquiry" ADD CONSTRAINT "inquiry_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_listing_id_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."listing"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_buyer_id_user_id_fk" FOREIGN KEY ("buyer_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase" ADD CONSTRAINT "purchase_seller_id_user_id_fk" FOREIGN KEY ("seller_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "inquiry_seller_idx" ON "inquiry" USING btree ("seller_id","created_at");--> statement-breakpoint
CREATE INDEX "inquiry_listing_idx" ON "inquiry" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_listing_idx" ON "purchase" USING btree ("listing_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_buyer_idx" ON "purchase" USING btree ("buyer_id","created_at");--> statement-breakpoint
CREATE INDEX "purchase_seller_idx" ON "purchase" USING btree ("seller_id","status","created_at");