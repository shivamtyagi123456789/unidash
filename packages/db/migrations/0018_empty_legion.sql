CREATE TABLE "file_folders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_id" uuid,
	"name" text NOT NULL,
	"term_id" uuid,
	"subject_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "storage_connections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" text DEFAULT 'GOOGLE_DRIVE' NOT NULL,
	"account_email" text NOT NULL,
	"root_folder_id" text,
	"encrypted_access_token" text NOT NULL,
	"encrypted_refresh_token" text NOT NULL,
	"access_token_expires_at" timestamp with time zone NOT NULL,
	"granted_scope" text NOT NULL,
	"key_version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "storage_connections_provider_ck" CHECK ("storage_connections"."provider" = 'GOOGLE_DRIVE')
);
--> statement-breakpoint
CREATE TABLE "stored_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"folder_id" uuid,
	"subject_id" uuid,
	"event_id" uuid,
	"drive_file_id" text NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" text,
	"source" text DEFAULT 'MANUAL' NOT NULL,
	"kind" text DEFAULT 'OTHER' NOT NULL,
	"tags" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "stored_files_size_ck" CHECK ("stored_files"."size_bytes" >= 0),
	CONSTRAINT "stored_files_source_ck" CHECK ("stored_files"."source" IN ('MANUAL', 'WHATSAPP', 'MOODLE', 'AMS')),
	CONSTRAINT "stored_files_kind_ck" CHECK ("stored_files"."kind" IN ('NOTE', 'SLIDE', 'PDF', 'ASSIGNMENT', 'LAB', 'PAPER', 'IMAGE', 'VIDEO', 'OTHER'))
);
--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_folders_user_id_uq" ON "file_folders" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_user_parent_fk" FOREIGN KEY ("user_id","parent_id") REFERENCES "public"."file_folders"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_user_term_fk" FOREIGN KEY ("user_id","term_id") REFERENCES "public"."terms"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "file_folders" ADD CONSTRAINT "file_folders_user_subject_fk" FOREIGN KEY ("user_id","subject_id") REFERENCES "public"."subjects"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "storage_connections" ADD CONSTRAINT "storage_connections_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_user_folder_fk" FOREIGN KEY ("user_id","folder_id") REFERENCES "public"."file_folders"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_user_subject_fk" FOREIGN KEY ("user_id","subject_id") REFERENCES "public"."subjects"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stored_files" ADD CONSTRAINT "stored_files_user_event_fk" FOREIGN KEY ("user_id","event_id") REFERENCES "public"."events"("user_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "file_folders_user_parent_name_uq" ON "file_folders" USING btree ("user_id","parent_id","name");--> statement-breakpoint
CREATE INDEX "file_folders_user_parent_idx" ON "file_folders" USING btree ("user_id","parent_id");--> statement-breakpoint
CREATE UNIQUE INDEX "storage_connections_user_uq" ON "storage_connections" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "storage_connections_user_idx" ON "storage_connections" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_files_user_id_uq" ON "stored_files" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "stored_files_user_drive_id_uq" ON "stored_files" USING btree ("user_id","drive_file_id");--> statement-breakpoint
CREATE INDEX "stored_files_user_folder_idx" ON "stored_files" USING btree ("user_id","folder_id","created_at");
