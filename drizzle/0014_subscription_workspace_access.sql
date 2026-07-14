CREATE TYPE "public"."SubscriptionPlanTier" AS ENUM ('TEAM', 'BUSINESS');
CREATE TYPE "public"."SubscriptionStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'EXPIRED');
CREATE TYPE "public"."SubscriptionPaymentStatus" AS ENUM ('PENDING', 'PAID', 'FAILED', 'REFUNDED');

CREATE TABLE "subscription_plans" (
  "id" varchar(30) PRIMARY KEY NOT NULL,
  "slug" varchar(40) NOT NULL UNIQUE,
  "name" varchar(80) NOT NULL,
  "tier" "SubscriptionPlanTier" NOT NULL,
  "tagline" text NOT NULL,
  "features" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "currency" varchar(3) DEFAULT 'USD' NOT NULL,
  "monthly_price_cents" integer NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "is_public" boolean DEFAULT true NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "subscriptions" (
  "id" varchar(30) PRIMARY KEY NOT NULL,
  "workspace_id" varchar(30) NOT NULL,
  "plan_id" varchar(30) NOT NULL,
  "status" "SubscriptionStatus" DEFAULT 'TRIALING' NOT NULL,
  "trial_started_at" timestamp with time zone,
  "trial_ends_at" timestamp with time zone,
  "current_period_started_at" timestamp with time zone NOT NULL,
  "current_period_ends_at" timestamp with time zone NOT NULL,
  "xendit_payment_session_id" varchar(120),
  "xendit_customer_id" varchar(120),
  "cancel_at_period_end" boolean DEFAULT false NOT NULL,
  "canceled_at" timestamp with time zone,
  "data_retention_until" timestamp with time zone,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "subscription_invoices" (
  "id" varchar(30) PRIMARY KEY NOT NULL,
  "subscription_id" varchar(30) NOT NULL,
  "workspace_id" varchar(30) NOT NULL,
  "xendit_payment_session_id" varchar(120) NOT NULL UNIQUE,
  "xendit_reference_id" varchar(120) NOT NULL UNIQUE,
  "payment_link_url" text NOT NULL,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "status" "SubscriptionPaymentStatus" DEFAULT 'PENDING' NOT NULL,
  "expires_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE "subscription_payments" (
  "id" varchar(30) PRIMARY KEY NOT NULL,
  "subscription_id" varchar(30) NOT NULL,
  "invoice_id" varchar(30),
  "workspace_id" varchar(30) NOT NULL,
  "xendit_payment_id" varchar(120) NOT NULL UNIQUE,
  "amount_cents" integer NOT NULL,
  "currency" varchar(3) NOT NULL,
  "status" "SubscriptionPaymentStatus" NOT NULL,
  "payment_method" varchar(80),
  "paid_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);

ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_plan_id_subscription_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."subscription_plans"("id") ON DELETE restrict;
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade;
ALTER TABLE "subscription_invoices" ADD CONSTRAINT "subscription_invoices_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_subscription_id_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."subscriptions"("id") ON DELETE cascade;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_invoice_id_subscription_invoices_id_fk" FOREIGN KEY ("invoice_id") REFERENCES "public"."subscription_invoices"("id") ON DELETE set null;
ALTER TABLE "subscription_payments" ADD CONSTRAINT "subscription_payments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade;

CREATE INDEX "subscription_plans_public_sort_idx" ON "subscription_plans" ("is_public", "sort_order");
CREATE UNIQUE INDEX "subscriptions_workspace_unique" ON "subscriptions" ("workspace_id");
CREATE UNIQUE INDEX "subscriptions_xendit_session_unique" ON "subscriptions" ("xendit_payment_session_id");
CREATE INDEX "subscriptions_status_period_idx" ON "subscriptions" ("status", "current_period_ends_at");
CREATE INDEX "subscription_invoices_workspace_created_idx" ON "subscription_invoices" ("workspace_id", "created_at");
CREATE INDEX "subscription_payments_workspace_created_idx" ON "subscription_payments" ("workspace_id", "created_at");

INSERT INTO "subscription_plans" ("id", "slug", "name", "tier", "tagline", "features", "currency", "monthly_price_cents", "sort_order") VALUES
  ('plan_team_monthly', 'team', 'Team', 'TEAM', 'Everything a growing team needs to track and report its work.', '["Live timers and manual time entries", "Projects, clients, tasks, and tags", "Daily, weekly, and monthly reports", "Report exports", "Team invitations"]'::jsonb, 'USD', 2000, 10),
  ('plan_business_monthly', 'business', 'Business', 'BUSINESS', 'More structure, oversight, and integrations for established teams.', '["Everything in Team", "Departments and cohorts", "Role-based workspace access", "Team and member analytics", "Google Sheets integration", "Audit logs and API access"]'::jsonb, 'USD', 5000, 20)
ON CONFLICT ("slug") DO UPDATE SET
  "name" = EXCLUDED."name",
  "tier" = EXCLUDED."tier",
  "tagline" = EXCLUDED."tagline",
  "features" = EXCLUDED."features",
  "currency" = EXCLUDED."currency",
  "monthly_price_cents" = EXCLUDED."monthly_price_cents",
  "sort_order" = EXCLUDED."sort_order",
  "is_active" = true,
  "is_public" = true,
  "updated_at" = now();

INSERT INTO "subscriptions" (
  "id", "workspace_id", "plan_id", "status", "trial_started_at", "trial_ends_at",
  "current_period_started_at", "current_period_ends_at"
)
SELECT
  substring('sub_' || md5(w."id") from 1 for 30), w."id", 'plan_team_monthly', 'TRIALING',
  now(), now() + interval '14 days', now(), now() + interval '14 days'
FROM "workspaces" w
ON CONFLICT ("workspace_id") DO NOTHING;
