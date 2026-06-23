CREATE TABLE "timer_reminder_emails" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"time_entry_id" varchar(30) NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"workspace_member_id" varchar(30) NOT NULL,
	"reminder_date" date NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timer_reminder_emails" ADD CONSTRAINT "timer_reminder_emails_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_reminder_emails" ADD CONSTRAINT "timer_reminder_emails_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_reminder_emails" ADD CONSTRAINT "timer_reminder_emails_workspace_member_id_workspace_members_id_fk" FOREIGN KEY ("workspace_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "timer_reminder_entry_date_unique" ON "timer_reminder_emails" USING btree ("time_entry_id","reminder_date");--> statement-breakpoint
CREATE INDEX "timer_reminder_workspace_sent_idx" ON "timer_reminder_emails" USING btree ("workspace_id","sent_at");--> statement-breakpoint
CREATE INDEX "timer_reminder_member_sent_idx" ON "timer_reminder_emails" USING btree ("workspace_member_id","sent_at");
