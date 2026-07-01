CREATE TABLE "member_client_billable_rates" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"workspace_member_id" varchar(30) NOT NULL,
	"client_id" varchar(30) NOT NULL,
	"billable_rate" numeric(12, 2) NOT NULL,
	"effective_from" date NOT NULL,
	"effective_to" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "member_client_rates_billable_rate_nonnegative" CHECK ("member_client_billable_rates"."billable_rate" >= 0),
	CONSTRAINT "member_client_rates_effective_dates_valid" CHECK ("member_client_billable_rates"."effective_to" is null or "member_client_billable_rates"."effective_to" >= "member_client_billable_rates"."effective_from")
);
--> statement-breakpoint
ALTER TABLE "member_client_billable_rates" ADD CONSTRAINT "member_client_billable_rates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_client_billable_rates" ADD CONSTRAINT "member_client_billable_rates_workspace_member_id_workspace_members_id_fk" FOREIGN KEY ("workspace_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "member_client_billable_rates" ADD CONSTRAINT "member_client_billable_rates_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "member_client_rates_workspace_member_client_idx" ON "member_client_billable_rates" USING btree ("workspace_id","workspace_member_id","client_id");--> statement-breakpoint
CREATE INDEX "member_client_rates_member_client_from_idx" ON "member_client_billable_rates" USING btree ("workspace_member_id","client_id","effective_from");--> statement-breakpoint
CREATE UNIQUE INDEX "member_client_rates_member_client_from_unique" ON "member_client_billable_rates" USING btree ("workspace_member_id","client_id","effective_from");
