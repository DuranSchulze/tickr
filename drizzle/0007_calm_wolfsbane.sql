CREATE TABLE "timer_preset_tags" (
	"timer_preset_id" varchar(30) NOT NULL,
	"tag_id" varchar(30) NOT NULL,
	CONSTRAINT "timer_preset_tags_timer_preset_id_tag_id_pk" PRIMARY KEY("timer_preset_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "timer_presets" (
	"id" varchar(30) PRIMARY KEY NOT NULL,
	"workspace_id" varchar(30) NOT NULL,
	"workspace_member_id" varchar(30) NOT NULL,
	"name" varchar(50) NOT NULL,
	"client_id" varchar(30) NOT NULL,
	"project_id" varchar(30) NOT NULL,
	"task_id" varchar(30),
	"billable" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "timer_preset_tags" ADD CONSTRAINT "timer_preset_tags_timer_preset_id_timer_presets_id_fk" FOREIGN KEY ("timer_preset_id") REFERENCES "public"."timer_presets"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_preset_tags" ADD CONSTRAINT "timer_preset_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_presets" ADD CONSTRAINT "timer_presets_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_presets" ADD CONSTRAINT "timer_presets_workspace_member_id_workspace_members_id_fk" FOREIGN KEY ("workspace_member_id") REFERENCES "public"."workspace_members"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_presets" ADD CONSTRAINT "timer_presets_client_id_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_presets" ADD CONSTRAINT "timer_presets_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "timer_presets" ADD CONSTRAINT "timer_presets_task_id_project_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."project_tasks"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "timer_preset_tags_tag_id_idx" ON "timer_preset_tags" USING btree ("tag_id");--> statement-breakpoint
CREATE UNIQUE INDEX "timer_presets_member_name_unique" ON "timer_presets" USING btree ("workspace_member_id","name");--> statement-breakpoint
CREATE INDEX "timer_presets_workspace_member_idx" ON "timer_presets" USING btree ("workspace_id","workspace_member_id");