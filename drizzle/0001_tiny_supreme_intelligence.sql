DO $$ BEGIN
 CREATE TYPE "public"."role" AS ENUM('user', 'admin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "users" ADD COLUMN "role" "role" DEFAULT 'user' NOT NULL;
EXCEPTION
 WHEN duplicate_column THEN null;
END $$;
