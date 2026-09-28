ALTER TABLE "model" ADD COLUMN "dealer_pulled_at" timestamp with time zone;--> statement-breakpoint
UPDATE "model" m SET "dealer_pulled_at" = s."last" FROM (SELECT "model_id", max("fetched_at") AS "last" FROM "dealer_sale" GROUP BY "model_id") s WHERE s."model_id" = m."id";--> statement-breakpoint
UPDATE "model" m SET "dealer_pulled_at" = greatest(m."dealer_pulled_at", s."last") FROM (SELECT "model_id", max("fetched_at") AS "last" FROM "dealer_active" GROUP BY "model_id") s WHERE s."model_id" = m."id";
