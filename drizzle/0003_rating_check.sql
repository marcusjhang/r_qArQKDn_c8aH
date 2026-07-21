-- Hand-authored: drizzle-kit 0.22 does not emit CHECK constraints.
-- Backs feedback.rating.$type<RatingValue>() at the database level.
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "rating_range" CHECK ("rating" BETWEEN 1 AND 4);
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
