CREATE TABLE "developer_accounts" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"created_by_user_id" varchar(30),
	"name" varchar(120) NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"permission_level" "RolePermission" DEFAULT 'OWNER' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_signed_in_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD CONSTRAINT "developer_accounts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "developer_accounts" ADD CONSTRAINT "developer_accounts_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "developer_accounts_workspace_email_unique" ON "developer_accounts" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "developer_accounts_email_idx" ON "developer_accounts" USING btree ("email");--> statement-breakpoint
CREATE INDEX "developer_accounts_workspace_idx" ON "developer_accounts" USING btree ("workspace_id");