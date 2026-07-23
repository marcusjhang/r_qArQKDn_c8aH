CREATE TABLE "stage_slas" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage" text NOT NULL,
	"max_days" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "stage_slas_max_days_range" CHECK ("stage_slas"."max_days" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "stage_entered_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "stage_slas_stage_lower_unique" ON "stage_slas" USING btree (lower("stage"));