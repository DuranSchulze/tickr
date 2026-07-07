ALTER TABLE "clients" ADD COLUMN "default_billable_rate" numeric(12, 2);--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_default_billable_rate_nonnegative" CHECK ("clients"."default_billable_rate" is null or "clients"."default_billable_rate" >= 0);
