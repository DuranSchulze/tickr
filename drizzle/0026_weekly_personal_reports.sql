CREATE TABLE "weekly_report_jobs" (
	"id" varchar(100) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"member_id" varchar(30) NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL,
	"first_attempt_at" timestamp with time zone,
	"lease_until" timestamp with time zone,
	"lease_token" text,
	"payload" jsonb,
	"provider_id" text,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekly_report_status_check" CHECK ("weekly_report_jobs"."status" in ('pending', 'processing', 'sent', 'skipped', 'retryable_failure', 'terminal_failure', 'uncertain'))
);
--> statement-breakpoint
CREATE TABLE "weekly_report_schedules" (
	"workspace_id" varchar(30) PRIMARY KEY NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"member_cursor" varchar(30) DEFAULT '' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "weekly_report_throttle" (
	"id" text PRIMARY KEY NOT NULL,
	"next_allowed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "weekly_report_email_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "weekly_report_enabled_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_report_jobs" ADD CONSTRAINT "weekly_report_jobs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_report_jobs" ADD CONSTRAINT "weekly_report_jobs_member_id_workspace_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_report_schedules" ADD CONSTRAINT "weekly_report_schedules_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_report_member_week_unique" ON "weekly_report_jobs" USING btree ("workspace_id","member_id","week_start");--> statement-breakpoint
CREATE INDEX "weekly_report_pending_idx" ON "weekly_report_jobs" USING btree ("status","next_attempt_at");--> statement-breakpoint
CREATE INDEX "weekly_report_retention_idx" ON "weekly_report_jobs" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "weekly_schedule_due_idx" ON "weekly_report_schedules" USING btree ("due_at");