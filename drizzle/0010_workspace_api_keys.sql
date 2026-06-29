CREATE TABLE "workspace_api_keys" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"created_by_user_id" varchar(30),
	"created_by_member_id" varchar(30),
	"name" varchar(100) NOT NULL,
	"token_hash" varchar(64) NOT NULL,
	"token_prefix" varchar(24) NOT NULL,
	"last_four" varchar(4) NOT NULL,
	"expires_at" timestamp with time zone,
	"last_used_at" timestamp with time zone,
	"last_used_ip" varchar(64),
	"revoked_at" timestamp with time zone,
	"revoked_by_user_id" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_api_keys_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_created_by_member_id_workspace_members_id_fk" FOREIGN KEY ("created_by_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_api_keys" ADD CONSTRAINT "workspace_api_keys_revoked_by_user_id_users_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "workspace_api_keys_workspace_idx" ON "workspace_api_keys" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_api_keys_workspace_revoked_idx" ON "workspace_api_keys" USING btree ("workspace_id","revoked_at");--> statement-breakpoint
CREATE INDEX "workspace_api_keys_workspace_expires_idx" ON "workspace_api_keys" USING btree ("workspace_id","expires_at");--> statement-breakpoint
CREATE INDEX "workspace_api_keys_created_by_user_idx" ON "workspace_api_keys" USING btree ("created_by_user_id");
