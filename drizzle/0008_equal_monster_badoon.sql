-- Rebuild the role enum as the four-tier hierarchy reader < writer < admin <
-- owner. Postgres can't DROP a value from an enum, so recreate the type and
-- migrate the column. Legacy 'user' rows (from before write enforcement, when
-- any authenticated user could write) map to 'writer' so nobody silently loses
-- access; new rows default to the least-privilege 'reader'.
ALTER TABLE "users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TYPE "role" RENAME TO "role_old";--> statement-breakpoint
CREATE TYPE "role" AS ENUM('reader', 'writer', 'admin', 'owner');--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" TYPE "role" USING (
  CASE "role"::text WHEN 'user' THEN 'writer' ELSE "role"::text END::"role"
);--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT 'reader';--> statement-breakpoint
DROP TYPE "role_old";
