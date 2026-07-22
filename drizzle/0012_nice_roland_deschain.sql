-- Convert candidates.owner and feedback.by_user from the old text short-codes
-- (ma/bo/bc/hl) to integer foreign keys into users.id. Done data-preservingly
-- (temp column + email-mapped backfill) rather than a bare type cast, which
-- would fail on the non-numeric text. On a fresh DB the tables are empty here,
-- so this is a no-op that just lands the final integer column + FK; the seeder
-- populates real ids afterward.

-- candidates.owner --------------------------------------------------------
ALTER TABLE "candidates" ADD COLUMN "owner_int" integer;--> statement-breakpoint
UPDATE "candidates" SET "owner_int" = u.id
FROM "users" u
WHERE u.email = (CASE "candidates"."owner"
  WHEN 'ma' THEN 'marcusajh0802@gmail.com'
  WHEN 'bo' THEN 'benong@lightsprint.ai'
  WHEN 'bc' THEN 'benchan@lightsprint.ai'
  WHEN 'hl' THEN 'henghonglee@lightsprint.ai'
  ELSE "candidates"."owner"
END);--> statement-breakpoint
UPDATE "candidates" SET "owner_int" = (SELECT id FROM "users" ORDER BY id LIMIT 1)
WHERE "owner_int" IS NULL AND EXISTS (SELECT 1 FROM "users");--> statement-breakpoint
ALTER TABLE "candidates" DROP COLUMN "owner";--> statement-breakpoint
ALTER TABLE "candidates" RENAME COLUMN "owner_int" TO "owner";--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "owner" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_owner_users_id_fk" FOREIGN KEY ("owner") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint

-- feedback.by_user --------------------------------------------------------
ALTER TABLE "feedback" ADD COLUMN "by_user_int" integer;--> statement-breakpoint
UPDATE "feedback" SET "by_user_int" = u.id
FROM "users" u
WHERE u.email = (CASE "feedback"."by_user"
  WHEN 'ma' THEN 'marcusajh0802@gmail.com'
  WHEN 'bo' THEN 'benong@lightsprint.ai'
  WHEN 'bc' THEN 'benchan@lightsprint.ai'
  WHEN 'hl' THEN 'henghonglee@lightsprint.ai'
  ELSE "feedback"."by_user"
END);--> statement-breakpoint
UPDATE "feedback" SET "by_user_int" = (SELECT id FROM "users" ORDER BY id LIMIT 1)
WHERE "by_user_int" IS NULL AND EXISTS (SELECT 1 FROM "users");--> statement-breakpoint
ALTER TABLE "feedback" DROP COLUMN "by_user";--> statement-breakpoint
ALTER TABLE "feedback" RENAME COLUMN "by_user_int" TO "by_user";--> statement-breakpoint
ALTER TABLE "feedback" ALTER COLUMN "by_user" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_by_user_users_id_fk" FOREIGN KEY ("by_user") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
