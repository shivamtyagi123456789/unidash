CREATE TABLE "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid,
	"type" text DEFAULT 'PROJECT' NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"status" text DEFAULT 'NOT_STARTED' NOT NULL,
	"deadline_at" timestamp (3) with time zone,
	"repo_url" text,
	"venue" text,
	"duration" text,
	"team" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"tasks" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"milestones" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"blocked_by" text,
	"drive_folder_id" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"archived_at" timestamp with time zone,
	CONSTRAINT "projects_type_ck" CHECK ("projects"."type" IN ('PROJECT', 'PRESENTATION', 'LAB_FILE', 'SEMINAR', 'RESEARCH', 'OTHER')),
	CONSTRAINT "projects_status_ck" CHECK ("projects"."status" IN ('NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'SUBMITTED', 'DONE'))
);
--> statement-breakpoint
ALTER TABLE "stored_files" ADD COLUMN "project_id" uuid;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_user_subject_fk" FOREIGN KEY ("user_id","subject_id") REFERENCES "public"."subjects"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_id_uq" ON "projects" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "projects_user_drive_folder_uq" ON "projects" USING btree ("user_id","drive_folder_id");--> statement-breakpoint
CREATE INDEX "projects_user_deadline_idx" ON "projects" USING btree ("user_id","deadline_at");--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_user_project_fk" FOREIGN KEY ("user_id","project_id") REFERENCES "public"."projects"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stored_files_user_project_idx" ON "stored_files" USING btree ("user_id","project_id","created_at");