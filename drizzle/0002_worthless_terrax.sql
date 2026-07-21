DO $$ BEGIN
 CREATE TYPE "public"."candidate_status" AS ENUM('active', 'onhold', 'rejected', 'hired');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "candidates" (
	"id" serial PRIMARY KEY NOT NULL,
	"job_id" integer NOT NULL,
	"name" text NOT NULL,
	"stage" text NOT NULL,
	"owner" text NOT NULL,
	"source" text NOT NULL,
	"status" "candidate_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "feedback" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"by_founder" text NOT NULL,
	"rating" integer NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "jobs" (
	"id" serial PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"stages" text[] NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "candidates" ADD CONSTRAINT "candidates_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "feedback_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
