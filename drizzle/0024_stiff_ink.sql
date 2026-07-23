CREATE TABLE "pipeline_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"stage_warn_days" integer DEFAULT 5 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "pipeline_settings_warn_range" CHECK ("pipeline_settings"."stage_warn_days" between 1 and 365)
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "stage_entered_at" timestamp DEFAULT now() NOT NULL;