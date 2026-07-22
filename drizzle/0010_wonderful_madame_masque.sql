CREATE TYPE "public"."booking_token_status" AS ENUM('active', 'used', 'expired', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."email_kind" AS ENUM('invite', 'candidate_confirmation', 'interviewer_notification', 'reminder', 'reschedule', 'cancellation');--> statement-breakpoint
CREATE TYPE "public"."email_status" AS ENUM('queued', 'sent', 'failed');--> statement-breakpoint
CREATE TYPE "public"."interview_status" AS ENUM('pending_booking', 'scheduled', 'completed', 'cancelled', 'no_show');--> statement-breakpoint
CREATE TYPE "public"."interview_type" AS ENUM('screen', 'interview', 'onsite');--> statement-breakpoint
CREATE TYPE "public"."location_kind" AS ENUM('video', 'phone', 'onsite');--> statement-breakpoint
CREATE TYPE "public"."notification_kind" AS ENUM('scheduled', 'needs_scheduling', 'interview_overdue', 'awaiting_decision', 'stale');--> statement-breakpoint
CREATE TYPE "public"."panel_member_status" AS ENUM('invited', 'accepted', 'declined');--> statement-breakpoint
CREATE TYPE "public"."panel_role" AS ENUM('lead', 'interviewer', 'shadow');--> statement-breakpoint
CREATE TABLE "availability_exceptions" (
	"id" serial PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"kind" text DEFAULT 'busy' NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "exception_span" CHECK ("availability_exceptions"."ends_at" > "availability_exceptions"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "booking_tokens" (
	"id" serial PRIMARY KEY NOT NULL,
	"token" text NOT NULL,
	"candidate_id" integer NOT NULL,
	"interview_id" integer,
	"status" "booking_token_status" DEFAULT 'active' NOT NULL,
	"candidate_tz" text,
	"expires_at" timestamp NOT NULL,
	"used_at" timestamp,
	"created_by" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "booking_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "email_outbox" (
	"id" serial PRIMARY KEY NOT NULL,
	"kind" "email_kind" NOT NULL,
	"status" "email_status" DEFAULT 'queued' NOT NULL,
	"to_email" text NOT NULL,
	"to_name" text DEFAULT '' NOT NULL,
	"subject" text NOT NULL,
	"body_text" text NOT NULL,
	"body_html" text DEFAULT '' NOT NULL,
	"ics_content" text,
	"candidate_id" integer,
	"interview_id" integer,
	"booking_token" text,
	"transport" text DEFAULT 'outbox' NOT NULL,
	"provider_id" text,
	"error" text DEFAULT '' NOT NULL,
	"send_after" timestamp,
	"sent_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_panel" (
	"id" serial PRIMARY KEY NOT NULL,
	"interview_id" integer NOT NULL,
	"founder_id" text NOT NULL,
	"role" "panel_role" DEFAULT 'interviewer' NOT NULL,
	"member_status" "panel_member_status" DEFAULT 'invited' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "panel_interview_founder" UNIQUE("interview_id","founder_id")
);
--> statement-breakpoint
CREATE TABLE "interviewer_availability" (
	"id" serial PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"weekday" integer NOT NULL,
	"start_minute" integer NOT NULL,
	"end_minute" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "weekday_range" CHECK ("interviewer_availability"."weekday" between 0 and 6),
	CONSTRAINT "minute_range" CHECK ("interviewer_availability"."start_minute" >= 0 and "interviewer_availability"."end_minute" <= 1440 and "interviewer_availability"."start_minute" < "interviewer_availability"."end_minute")
);
--> statement-breakpoint
CREATE TABLE "interviewer_settings" (
	"id" serial PRIMARY KEY NOT NULL,
	"founder_id" text NOT NULL,
	"is_interviewer" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "interviewer_settings_founder_id_unique" UNIQUE("founder_id")
);
--> statement-breakpoint
CREATE TABLE "interviews" (
	"id" serial PRIMARY KEY NOT NULL,
	"candidate_id" integer NOT NULL,
	"job_id" integer NOT NULL,
	"type" "interview_type" DEFAULT 'interview' NOT NULL,
	"status" "interview_status" DEFAULT 'pending_booking' NOT NULL,
	"starts_at" timestamp,
	"ends_at" timestamp,
	"duration_min" integer DEFAULT 45 NOT NULL,
	"buffer_min" integer DEFAULT 15 NOT NULL,
	"location_kind" "location_kind" DEFAULT 'video' NOT NULL,
	"location_detail" text DEFAULT '' NOT NULL,
	"stage_at_booking" text,
	"created_by" text,
	"rescheduled_from_id" integer,
	"cancel_reason" text DEFAULT '' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" serial PRIMARY KEY NOT NULL,
	"recipient_founder_id" text NOT NULL,
	"candidate_id" integer NOT NULL,
	"kind" "notification_kind" NOT NULL,
	"message" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "notifications_dedupe_key_unique" UNIQUE("dedupe_key")
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "stage_entered_at" timestamp DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "schedule_status" text;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "scheduled_at" timestamp;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "completed_at" timestamp;--> statement-breakpoint
ALTER TABLE "booking_tokens" ADD CONSTRAINT "booking_tokens_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "booking_tokens" ADD CONSTRAINT "booking_tokens_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "email_outbox" ADD CONSTRAINT "email_outbox_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_panel" ADD CONSTRAINT "interview_panel_interview_id_interviews_id_fk" FOREIGN KEY ("interview_id") REFERENCES "public"."interviews"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interviews" ADD CONSTRAINT "interviews_job_id_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE cascade ON UPDATE no action;