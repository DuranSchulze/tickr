CREATE TABLE "auth_abuse_counters" (
	"bucket" varchar(64) PRIMARY KEY NOT NULL,
	"scope" varchar(24) NOT NULL,
	"operation" varchar(32) NOT NULL,
	"window_started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"strikes" integer DEFAULT 0 NOT NULL,
	"cooldown_until" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "auth_abuse_counters_updated_at_idx" ON "auth_abuse_counters" USING btree ("updated_at");
