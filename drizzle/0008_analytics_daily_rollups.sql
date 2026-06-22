CREATE TABLE "analytics_daily_member_metrics" (
	"workspace_id" varchar(30) NOT NULL,
	"workspace_member_id" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"department_id" varchar(30),
	"entry_count" integer DEFAULT 0 NOT NULL,
	"total_seconds" integer DEFAULT 0 NOT NULL,
	"billable_seconds" integer DEFAULT 0 NOT NULL,
	"non_billable_seconds" integer DEFAULT 0 NOT NULL,
	"billable_amount" numeric(12, 2) DEFAULT '0' NOT NULL,
	"first_entry_at" timestamp with time zone,
	"last_entry_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_daily_member_metrics_workspace_id_workspace_member_id_date_pk" PRIMARY KEY("workspace_id","workspace_member_id","date")
);
--> statement-breakpoint
CREATE TABLE "pending_analytics_rollups" (
	"workspace_id" varchar(30) NOT NULL,
	"workspace_member_id" varchar(30) NOT NULL,
	"date" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pending_analytics_rollups_workspace_id_workspace_member_id_date_pk" PRIMARY KEY("workspace_id","workspace_member_id","date")
);
--> statement-breakpoint
ALTER TABLE "analytics_daily_member_metrics" ADD CONSTRAINT "analytics_daily_member_metrics_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_daily_member_metrics" ADD CONSTRAINT "analytics_daily_member_metrics_workspace_member_id_workspace_members_id_fk" FOREIGN KEY ("workspace_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_daily_member_metrics" ADD CONSTRAINT "analytics_daily_member_metrics_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_analytics_rollups" ADD CONSTRAINT "pending_analytics_rollups_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pending_analytics_rollups" ADD CONSTRAINT "pending_analytics_rollups_workspace_member_id_workspace_members_id_fk" FOREIGN KEY ("workspace_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "analytics_daily_workspace_date_idx" ON "analytics_daily_member_metrics" USING btree ("workspace_id","date");--> statement-breakpoint
CREATE INDEX "analytics_daily_workspace_member_date_idx" ON "analytics_daily_member_metrics" USING btree ("workspace_id","workspace_member_id","date");--> statement-breakpoint
CREATE INDEX "analytics_daily_workspace_department_date_idx" ON "analytics_daily_member_metrics" USING btree ("workspace_id","department_id","date");--> statement-breakpoint
CREATE INDEX "pending_analytics_rollups_created_idx" ON "pending_analytics_rollups" USING btree ("created_at");--> statement-breakpoint
INSERT INTO "analytics_daily_member_metrics" (
	"workspace_id",
	"workspace_member_id",
	"date",
	"department_id",
	"entry_count",
	"total_seconds",
	"billable_seconds",
	"non_billable_seconds",
	"billable_amount",
	"first_entry_at",
	"last_entry_at",
	"updated_at"
)
SELECT
	te."workspace_id",
	te."workspace_member_id",
	DATE(te."started_at"),
	wm."department_id",
	COUNT(*)::int,
	COALESCE(SUM(te."duration_seconds"), 0)::int,
	COALESCE(SUM(CASE WHEN te."billable" THEN te."duration_seconds" ELSE 0 END), 0)::int,
	COALESCE(SUM(CASE WHEN te."billable" THEN 0 ELSE te."duration_seconds" END), 0)::int,
	COALESCE(SUM(CASE WHEN te."billable" THEN te."duration_seconds"::numeric / 3600.0 * COALESCE(wm."billable_rate"::numeric, w."default_billable_rate"::numeric, 0) ELSE 0 END), 0)::numeric(12, 2),
	MIN(te."started_at"),
	MAX(te."ended_at"),
	NOW()
FROM "time_entries" te
INNER JOIN "workspace_members" wm ON wm."id" = te."workspace_member_id"
INNER JOIN "workspaces" w ON w."id" = te."workspace_id"
WHERE te."ended_at" IS NOT NULL
GROUP BY te."workspace_id", te."workspace_member_id", DATE(te."started_at"), wm."department_id";
