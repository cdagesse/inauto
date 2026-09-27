CREATE TABLE "market_snapshot" (
	"model_id" text PRIMARY KEY NOT NULL,
	"built_at" timestamp with time zone DEFAULT now() NOT NULL,
	"data_through" text NOT NULL,
	"summary" jsonb NOT NULL,
	"snapshot" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "market_snapshot" ADD CONSTRAINT "market_snapshot_model_id_model_id_fk" FOREIGN KEY ("model_id") REFERENCES "public"."model"("id") ON DELETE cascade ON UPDATE no action;