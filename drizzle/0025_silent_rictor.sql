CREATE INDEX "project_tasks_workspace_name_idx" ON "project_tasks" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "sessions_user_id_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "time_entries_ws_member_updated_idx" ON "time_entries" USING btree ("workspace_id","workspace_member_id","updated_at");--> statement-breakpoint
CREATE INDEX "time_entries_workspace_updated_idx" ON "time_entries" USING btree ("workspace_id","updated_at");--> statement-breakpoint
CREATE INDEX "time_entries_workspace_project_idx" ON "time_entries" USING btree ("workspace_id","project_id");