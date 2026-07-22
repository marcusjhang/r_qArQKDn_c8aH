CREATE TABLE "sources" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "sources_name_unique" UNIQUE("name")
);
--> statement-breakpoint
-- Convert candidates.source from free text to an integer FK into sources.
-- Backfill the lookup table from whatever source names already exist (so the
-- FK is satisfiable on the live DB; a no-op on a fresh/empty DB — the seeder
-- populates sources there), then remap each candidate to the matching id.
INSERT INTO "sources" ("name") SELECT DISTINCT "source" FROM "candidates" ON CONFLICT ("name") DO NOTHING;--> statement-breakpoint
ALTER TABLE "candidates" ADD COLUMN "source_int" integer;--> statement-breakpoint
UPDATE "candidates" SET "source_int" = s.id FROM "sources" s WHERE s.name = "candidates"."source";--> statement-breakpoint
UPDATE "candidates" SET "source_int" = (SELECT id FROM "sources" ORDER BY id LIMIT 1)
WHERE "source_int" IS NULL AND EXISTS (SELECT 1 FROM "sources");--> statement-breakpoint
ALTER TABLE "candidates" DROP COLUMN "source";--> statement-breakpoint
ALTER TABLE "candidates" RENAME COLUMN "source_int" TO "source";--> statement-breakpoint
ALTER TABLE "candidates" ALTER COLUMN "source" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_source_sources_id_fk" FOREIGN KEY ("source") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;
