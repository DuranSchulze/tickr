CREATE TYPE "public"."ClientStatus" AS ENUM('ACTIVE', 'INACTIVE');--> statement-breakpoint
CREATE TYPE "public"."EmploymentStatus" AS ENUM('ACTIVE', 'ON_LEAVE', 'RESIGNED', 'TERMINATED');--> statement-breakpoint
CREATE TYPE "public"."EmploymentType" AS ENUM('FULL_TIME', 'PART_TIME', 'CONTRACTOR', 'INTERN', 'PROBATIONARY');--> statement-breakpoint
CREATE TYPE "public"."Gender" AS ENUM('MALE', 'FEMALE', 'NON_BINARY', 'PREFER_NOT_TO_SAY');--> statement-breakpoint
CREATE TYPE "public"."MaritalStatus" AS ENUM('SINGLE', 'MARRIED', 'SEPARATED', 'WIDOWED', 'DIVORCED');--> statement-breakpoint
CREATE TYPE "public"."MemberStatus" AS ENUM('INVITED', 'ACTIVE', 'DISABLED');--> statement-breakpoint
CREATE TYPE "public"."RolePermission" AS ENUM('OWNER', 'ADMIN', 'MANAGER', 'EMPLOYEE');--> statement-breakpoint
CREATE TABLE "accounts" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"account_id" varchar(255) NOT NULL,
	"provider_id" varchar(255) NOT NULL,
	"user_id" varchar(30) NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "audit_logs" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"actor_id" varchar(30),
	"actor_email" varchar(255),
	"action" varchar(50) NOT NULL,
	"target_type" varchar(50),
	"target_id" varchar(30),
	"details" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "clients" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"client_status" "ClientStatus" DEFAULT 'ACTIVE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cohort_members" (
	"cohort_id" varchar(30) NOT NULL,
	"member_id" varchar(30) NOT NULL,
	CONSTRAINT "cohort_members_cohort_id_member_id_pk" PRIMARY KEY("cohort_id","member_id")
);
--> statement-breakpoint
CREATE TABLE "cohorts" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"department_id" varchar(30),
	"name" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "departments" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"description" text,
	"color" varchar(20) DEFAULT '#6366f1' NOT NULL,
	"head_member_id" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "employee_government_ids" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"employee_profile_id" varchar(30) NOT NULL,
	"sss" varchar(25),
	"phic" varchar(25),
	"tin" varchar(25),
	"phmd" varchar(25),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_government_ids_employee_profile_id_unique" UNIQUE("employee_profile_id"),
	CONSTRAINT "employee_government_ids_sss_unique" UNIQUE("sss"),
	CONSTRAINT "employee_government_ids_phic_unique" UNIQUE("phic"),
	CONSTRAINT "employee_government_ids_tin_unique" UNIQUE("tin"),
	CONSTRAINT "employee_government_ids_phmd_unique" UNIQUE("phmd")
);
--> statement-breakpoint
CREATE TABLE "employee_profiles" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_member_id" varchar(30) NOT NULL,
	"employee_number" varchar(50),
	"position_title" varchar(100),
	"employment_type" "EmploymentType" DEFAULT 'FULL_TIME' NOT NULL,
	"employment_status" "EmploymentStatus" DEFAULT 'ACTIVE' NOT NULL,
	"hire_date" date,
	"regularization_date" date,
	"separation_date" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employee_profiles_workspace_member_id_unique" UNIQUE("workspace_member_id")
);
--> statement-breakpoint
CREATE TABLE "performance_share_links" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"member_id" varchar(30) NOT NULL,
	"token" varchar(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "performance_share_links_member_id_unique" UNIQUE("member_id"),
	CONSTRAINT "performance_share_links_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"client_id" varchar(30) NOT NULL,
	"name" varchar(120) NOT NULL,
	"color" varchar(20) DEFAULT '#2563eb' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" varchar(255) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" varchar(30) NOT NULL,
	CONSTRAINT "sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"name" varchar(80) NOT NULL,
	"color" varchar(20) DEFAULT '#14b8a6' NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"workspace_member_id" varchar(30) NOT NULL,
	"description" text NOT NULL,
	"project_id" varchar(30),
	"billable" boolean DEFAULT false NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"ended_at" timestamp with time zone,
	"duration_seconds" integer DEFAULT 0 NOT NULL,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "time_entry_tags" (
	"time_entry_id" varchar(30) NOT NULL,
	"tag_id" varchar(30) NOT NULL,
	CONSTRAINT "time_entry_tags_time_entry_id_tag_id_pk" PRIMARY KEY("time_entry_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "user_addresses" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"user_profile_id" varchar(30) NOT NULL,
	"building_no" varchar(50),
	"street" varchar(100),
	"city" varchar(100),
	"province" varchar(100),
	"postal_code" varchar(20),
	"country" varchar(100) DEFAULT 'Philippines' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_addresses_user_profile_id_unique" UNIQUE("user_profile_id")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"user_id" varchar(30) NOT NULL,
	"first_name" varchar(50) NOT NULL,
	"middle_name" varchar(50),
	"last_name" varchar(50) NOT NULL,
	"birth_date" date,
	"gender" "Gender",
	"marital_status" "MaritalStatus",
	"contact_number" varchar(50),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_user_id_unique" UNIQUE("user_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verifications" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"identifier" varchar(255) NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now(),
	"updated_at" timestamp with time zone DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "workspace_invites" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"email" varchar(255) NOT NULL,
	"workspace_role_id" varchar(30),
	"department_id" varchar(30),
	"invited_by_id" varchar(30),
	"token_hash" varchar(128) NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspace_invites_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "workspace_members" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"user_id" varchar(30),
	"email" varchar(255) NOT NULL,
	"workspace_role_id" varchar(30),
	"status" "MemberStatus" DEFAULT 'INVITED' NOT NULL,
	"billable_rate" numeric(12, 2),
	"department_id" varchar(30),
	"invited_by_id" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspace_roles" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"name" varchar(100) NOT NULL,
	"permission_level" "RolePermission" DEFAULT 'EMPLOYEE' NOT NULL,
	"color" varchar(20) DEFAULT '#6366f1' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"name" varchar(150) NOT NULL,
	"slug" varchar(120) NOT NULL,
	"timezone" varchar(80) DEFAULT 'Asia/Manila' NOT NULL,
	"default_billable_rate" numeric(12, 2) DEFAULT '0' NOT NULL,
	"billable_currency" varchar(8) DEFAULT 'PHP' NOT NULL,
	"google_sheet_url" varchar(500),
	"google_sheet_synced_at" timestamp with time zone,
	"google_sheet_synced_by" varchar(30),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "workspaces_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "clients" ADD CONSTRAINT "clients_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_cohort_id_cohorts_id_fk" FOREIGN KEY ("cohort_id") REFERENCES "public"."cohorts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohort_members" ADD CONSTRAINT "cohort_members_member_id_workspace_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cohorts" ADD CONSTRAINT "cohorts_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "departments" ADD CONSTRAINT "departments_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_government_ids" ADD CONSTRAINT "employee_government_ids_employee_profile_id_employee_profiles_id_fk" FOREIGN KEY ("employee_profile_id") REFERENCES "public"."employee_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employee_profiles" ADD CONSTRAINT "employee_profiles_workspace_member_id_workspace_members_id_fk" FOREIGN KEY ("workspace_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "performance_share_links" ADD CONSTRAINT "performance_share_links_member_id_workspace_members_id_fk" FOREIGN KEY ("member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_workspace_member_id_workspace_members_id_fk" FOREIGN KEY ("workspace_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tags" ADD CONSTRAINT "time_entry_tags_time_entry_id_time_entries_id_fk" FOREIGN KEY ("time_entry_id") REFERENCES "public"."time_entries"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entry_tags" ADD CONSTRAINT "time_entry_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_addresses" ADD CONSTRAINT "user_addresses_user_profile_id_user_profiles_id_fk" FOREIGN KEY ("user_profile_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_workspace_role_id_workspace_roles_id_fk" FOREIGN KEY ("workspace_role_id") REFERENCES "public"."workspace_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_invites" ADD CONSTRAINT "workspace_invites_invited_by_id_workspace_members_id_fk" FOREIGN KEY ("invited_by_id") REFERENCES "public"."workspace_members"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_workspace_role_id_workspace_roles_id_fk" FOREIGN KEY ("workspace_role_id") REFERENCES "public"."workspace_roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_members" ADD CONSTRAINT "workspace_members_department_id_departments_id_fk" FOREIGN KEY ("department_id") REFERENCES "public"."departments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "workspace_roles" ADD CONSTRAINT "workspace_roles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_id_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_created_idx" ON "audit_logs" USING btree ("workspace_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_logs_workspace_action_idx" ON "audit_logs" USING btree ("workspace_id","action");--> statement-breakpoint
CREATE UNIQUE INDEX "clients_workspace_id_name_unique" ON "clients" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "cohort_members_member_id_idx" ON "cohort_members" USING btree ("member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "cohorts_workspace_dept_name_unique" ON "cohorts" USING btree ("workspace_id","department_id","name");--> statement-breakpoint
CREATE INDEX "cohorts_department_id_idx" ON "cohorts" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "departments_workspace_id_name_unique" ON "departments" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "departments_head_member_idx" ON "departments" USING btree ("head_member_id");--> statement-breakpoint
CREATE UNIQUE INDEX "employee_profiles_employee_number_unique" ON "employee_profiles" USING btree ("employee_number");--> statement-breakpoint
CREATE INDEX "employee_profiles_employment_status_idx" ON "employee_profiles" USING btree ("employment_status");--> statement-breakpoint
CREATE INDEX "performance_share_links_token_idx" ON "performance_share_links" USING btree ("token");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_workspace_id_name_unique" ON "projects" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "projects_client_id_idx" ON "projects" USING btree ("client_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_workspace_id_name_unique" ON "tags" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "time_entries_workspace_member_started_idx" ON "time_entries" USING btree ("workspace_id","workspace_member_id","started_at");--> statement-breakpoint
CREATE INDEX "time_entries_workspace_ended_idx" ON "time_entries" USING btree ("workspace_id","ended_at");--> statement-breakpoint
CREATE INDEX "time_entries_project_id_idx" ON "time_entries" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "time_entry_tags_tag_id_idx" ON "time_entry_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE INDEX "user_addresses_city_province_idx" ON "user_addresses" USING btree ("city","province");--> statement-breakpoint
CREATE INDEX "user_profiles_last_first_idx" ON "user_profiles" USING btree ("last_name","first_name");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_invites_workspace_id_email_unique" ON "workspace_invites" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "workspace_invites_workspace_id_idx" ON "workspace_invites" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "workspace_invites_invited_by_idx" ON "workspace_invites" USING btree ("invited_by_id");--> statement-breakpoint
CREATE INDEX "workspace_invites_department_id_idx" ON "workspace_invites" USING btree ("department_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_members_workspace_id_email_unique" ON "workspace_members" USING btree ("workspace_id","email");--> statement-breakpoint
CREATE INDEX "workspace_members_workspace_role_idx" ON "workspace_members" USING btree ("workspace_id","workspace_role_id");--> statement-breakpoint
CREATE INDEX "workspace_members_user_id_idx" ON "workspace_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "workspace_members_department_id_idx" ON "workspace_members" USING btree ("department_id");--> statement-breakpoint
CREATE INDEX "workspace_members_invited_by_idx" ON "workspace_members" USING btree ("invited_by_id");--> statement-breakpoint
CREATE UNIQUE INDEX "workspace_roles_workspace_id_name_unique" ON "workspace_roles" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "workspace_roles_workspace_permission_idx" ON "workspace_roles" USING btree ("workspace_id","permission_level");