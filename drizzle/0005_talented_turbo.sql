CREATE TABLE IF NOT EXISTS "allowed_emails" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "allowed_emails_email_unique" UNIQUE("email")
);
