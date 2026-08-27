ALTER TABLE "time_entries" ADD COLUMN "location_source" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "location_accuracy_m" integer;

-- Rollback:
-- ALTER TABLE "time_entries" DROP COLUMN "location_accuracy_m";
-- ALTER TABLE "time_entries" DROP COLUMN "location_source";
