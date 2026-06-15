-- pg_trgm powers substring (ILIKE '%term%') search via the GIN index below.
CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
-- Catalog pagination: WHERE workspace_id = ? ORDER BY name (was a full seq scan + sort).
CREATE INDEX IF NOT EXISTS "projects_workspace_name_idx" ON "projects" USING btree ("workspace_id","name");--> statement-breakpoint
-- Substring search on project names (a btree cannot serve a leading-wildcard ILIKE).
CREATE INDEX IF NOT EXISTS "projects_name_trgm_idx" ON "projects" USING gin ("name" gin_trgm_ops);
-- Note: workspace_invites.join_code was already applied to the database via db:push
-- before this migration was generated; its DDL is intentionally omitted here to avoid
-- a duplicate-column error. The schema snapshot already records the column.
