-- Weighted trait scoring: per-job traits + JD, per-entry trait scores + stage,
-- and removal of the single verdict rating.
ALTER TABLE "jobs" ADD COLUMN "traits" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "trait_scores" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "stage" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Anchor each existing entry to its candidate's current stage.
UPDATE "feedback" f SET "stage" = c."stage" FROM "candidates" c WHERE f."candidate_id" = c."id";--> statement-breakpoint
-- Drop the verdict rating; PostgreSQL drops the dependent rating_range CHECK.
ALTER TABLE "feedback" DROP COLUMN "rating";
