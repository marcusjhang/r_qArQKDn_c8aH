CREATE TABLE "seniority_bands" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"min_years" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "seniority_bands_min_years_unique" UNIQUE("min_years")
);
