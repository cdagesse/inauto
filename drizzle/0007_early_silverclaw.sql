ALTER TABLE "external_listing" ADD COLUMN "currency" text DEFAULT 'USD' NOT NULL;--> statement-breakpoint
ALTER TABLE "external_listing" ADD COLUMN "country" text;