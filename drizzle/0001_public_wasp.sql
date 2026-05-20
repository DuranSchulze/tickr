DROP INDEX "projects_workspace_id_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_id_client_id_name_unique" ON "projects" USING btree ("workspace_id","client_id","name");