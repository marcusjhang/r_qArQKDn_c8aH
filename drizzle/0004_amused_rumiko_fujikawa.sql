DROP TABLE "products";
--> statement-breakpoint
-- Drop the now-orphaned products status enum (drizzle-kit 0.22 doesn't emit this).
DROP TYPE IF EXISTS "public"."status";
