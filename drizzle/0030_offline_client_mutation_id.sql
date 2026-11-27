-- Offline replay idempotency (offline-mode REQ-2). Production already has this
-- column and index from an earlier, uncommitted migration, so both statements
-- are idempotent. Only adds; never drops.
ALTER TABLE "time_entries" ADD COLUMN IF NOT EXISTS "client_mutation_id" varchar(64);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "time_entries_member_mutation_unique" ON "time_entries" USING btree ("workspace_id","workspace_member_id","client_mutation_id");
