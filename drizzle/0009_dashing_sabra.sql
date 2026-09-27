CREATE TABLE "car_view" (
	"kind" text NOT NULL,
	"ref_id" text NOT NULL,
	"day" date NOT NULL,
	"views" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "car_view_kind_ref_id_day_pk" PRIMARY KEY("kind","ref_id","day")
);
