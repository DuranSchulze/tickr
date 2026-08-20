DROP INDEX "timer_reminder_entry_date_unique";--> statement-breakpoint
ALTER TABLE "timer_reminder_emails" ADD COLUMN "kind" varchar(10) DEFAULT '4h' NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "timer_reminder_entry_kind_unique" ON "timer_reminder_emails" USING btree ("time_entry_id","kind");