ALTER TABLE "job_run" ADD COLUMN "changed" integer;--> statement-breakpoint
CREATE INDEX "job_run_name_started_idx" ON "job_run" USING btree ("name","started_at");--> statement-breakpoint
UPDATE "job_run" SET "finished_at" = "started_at", "ok" = true
WHERE "name" LIKE 'backfill-auctions:%' AND "finished_at" IS NULL AND "started_at" < now() - interval '10 minutes';
