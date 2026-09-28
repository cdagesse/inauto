ALTER TABLE "job_run" ADD COLUMN "changed" integer;--> statement-breakpoint
CREATE INDEX "job_run_name_started_idx" ON "job_run" USING btree ("name","started_at");