CREATE TABLE "pending_gsheets_syncs" (
	"workspace_id" varchar(30) PRIMARY KEY NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "pending_gsheets_syncs" ADD CONSTRAINT "pending_gsheets_syncs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;