ALTER TABLE "feedback" DROP CONSTRAINT "rating_range";--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "trait_scores" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD COLUMN "stage" text DEFAULT '' NOT NULL;--> statement-breakpoint
-- Anchor each existing entry to its candidate's current stage (the new column
-- otherwise defaults to '' for pre-existing rows).
UPDATE "feedback" f SET "stage" = c."stage" FROM "candidates" c WHERE f."candidate_id" = c."id";--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "traits" text[] DEFAULT '{}'::text[] NOT NULL;--> statement-breakpoint
ALTER TABLE "jobs" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "rating";