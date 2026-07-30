CREATE TYPE "public"."TimeEntrySource" AS ENUM('TIMER', 'MANUAL');--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "entry_source" "TimeEntrySource";

-- Rollback:
-- ALTER TABLE "time_entries" DROP COLUMN "entry_source";
-- DROP TYPE "public"."TimeEntrySource";
