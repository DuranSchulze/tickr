ALTER TABLE "time_entries" ADD COLUMN "ip_address" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "location" text;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "latitude" double precision;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "longitude" double precision;--> statement-breakpoint
ALTER TABLE "time_entries" ADD COLUMN "user_agent" text;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "location_tracking_enabled" boolean DEFAULT true NOT NULL;