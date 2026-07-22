-- drizzle-kit 0.31 now tracks CHECK constraints in its snapshots (0.22 did not),
-- so upgrading regenerates the `rating_range` check that was already added
-- idempotently by the hand-authored 0003_rating_check migration. Guard against
-- duplicate_object so this stays a safe no-op on any DB where 0003 has run
-- (including fresh setups applying 0000 -> 0009 in order).
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "rating_range" CHECK ("feedback"."rating" between 1 and 4);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
