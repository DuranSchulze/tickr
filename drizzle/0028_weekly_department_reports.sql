CREATE TABLE "weekday_confirmations" (
	"workspace_id" varchar(30) NOT NULL,
	"member_id" varchar(30) NOT NULL,
	"local_date" date NOT NULL,
	"confirmed_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weekday_confirmations_workspace_id_member_id_local_date_pk" PRIMARY KEY("workspace_id","member_id","local_date"),
	CONSTRAINT "weekday_confirmation_weekday" CHECK (extract(isodow from "weekday_confirmations"."local_date") between 1 and 5)
);
--> statement-breakpoint
CREATE TABLE "weekly_department_reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"department_id" varchar(30) NOT NULL,
	"week_start" date NOT NULL,
	"week_end" date NOT NULL,
	"timezone" varchar(80) NOT NULL,
	"due_at" timestamp with time zone NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "weekly_report_member_week_unique";--> statement-breakpoint
ALTER TABLE "weekly_report_jobs" ADD COLUMN "report_type" text DEFAULT 'personal' NOT NULL;--> statement-breakpoint
ALTER TABLE "weekly_report_jobs" ADD COLUMN "report_id" uuid;--> statement-breakpoint
ALTER TABLE "weekly_report_jobs" ADD COLUMN "attachment_roster" jsonb;--> statement-breakpoint
ALTER TABLE "weekly_report_jobs" ADD COLUMN "attempt_started_in_lease" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD COLUMN "department_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "weekday_confirmations" ADD CONSTRAINT "weekday_confirmations_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekday_confirmations" ADD CONSTRAINT "weekday_confirmations_member_id_workspace_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_department_reports" ADD CONSTRAINT "weekly_department_reports_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "weekly_department_reports" ADD CONSTRAINT "weekly_department_reports_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_department_report_week_unique" ON "weekly_department_reports" USING btree ("workspace_id","department_id","week_start");--> statement-breakpoint
CREATE INDEX "weekly_department_report_expiry_idx" ON "weekly_department_reports" USING btree ("expires_at");--> statement-breakpoint
ALTER TABLE "weekly_report_jobs" ADD CONSTRAINT "weekly_report_jobs_report_id_weekly_department_reports_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."weekly_department_reports"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "weekly_report_member_week_unique" ON "weekly_report_jobs" USING btree ("workspace_id","member_id","week_start","report_type");--> statement-breakpoint
ALTER TABLE "weekly_report_jobs" ADD CONSTRAINT "weekly_report_type_check" CHECK ("weekly_report_jobs"."report_type" in ('personal', 'department'));
--> statement-breakpoint
CREATE FUNCTION track_workspace_member_department_assignment() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    NEW.department_assigned_at := CASE WHEN NEW.department_id IS NOT NULL THEN now() END;
  ELSIF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    NEW.department_assigned_at := CASE WHEN NEW.department_id IS NOT NULL THEN now() END;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER track_workspace_member_department_assignment
BEFORE INSERT OR UPDATE OF department_id ON workspace_members
FOR EACH ROW EXECUTE FUNCTION track_workspace_member_department_assignment();
--> statement-breakpoint
UPDATE weekly_report_jobs
SET status = CASE WHEN status = 'processing' AND attempts > 0 THEN 'uncertain' ELSE 'skipped' END,
    error = 'weekly_department_cutover', payload = null, lease_until = null, lease_token = null, updated_at = now()
WHERE report_type = 'personal' AND status IN ('pending', 'retryable_failure', 'processing');
