CREATE TABLE "allowed_emails" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "allowed_emails_role_ck" CHECK ("allowed_emails"."role" IN ('OWNER', 'MEMBER'))
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" text NOT NULL,
	"kind" text NOT NULL,
	"subject_code" text,
	"source" text NOT NULL,
	"source_ref" text,
	"status" text DEFAULT 'CONFIRMED' NOT NULL,
	"starts_at" timestamp with time zone NOT NULL,
	"ends_at" timestamp with time zone,
	"natural_key" text,
	"locked_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'NOT_CONNECTED' NOT NULL,
	"last_success_at" timestamp with time zone,
	"last_error_code" text,
	"last_error_message" text,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "integrations_kind_ck" CHECK ("integrations"."kind" IN ('AMS', 'MOODLE')),
	CONSTRAINT "integrations_status_ck" CHECK ("integrations"."status" IN ('NOT_CONNECTED', 'READY', 'SYNCING', 'NEEDS_REAUTH', 'PAUSED', 'ERROR'))
);
--> statement-breakpoint
CREATE TABLE "user_settings" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"timezone" text DEFAULT 'Asia/Kolkata' NOT NULL,
	"attendance_threshold" integer DEFAULT 75 NOT NULL,
	"quiet_hours_start" text DEFAULT '23:00' NOT NULL,
	"quiet_hours_end" text DEFAULT '06:30' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_settings_threshold_ck" CHECK ("user_settings"."attendance_threshold" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"google_subject" text NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"role" text DEFAULT 'MEMBER' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_role_ck" CHECK ("users"."role" IN ('OWNER', 'MEMBER'))
);
--> statement-breakpoint
CREATE TABLE "worker_heartbeats" (
	"worker_id" text PRIMARY KEY NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" text NOT NULL,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_settings" ADD CONSTRAINT "user_settings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "allowed_emails_email_uq" ON "allowed_emails" USING btree ("email");--> statement-breakpoint
CREATE INDEX "events_user_start_idx" ON "events" USING btree ("user_id","starts_at");--> statement-breakpoint
CREATE INDEX "events_user_kind_idx" ON "events" USING btree ("user_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "events_user_source_ref_uq" ON "events" USING btree ("user_id","source","source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "integrations_user_kind_uq" ON "integrations" USING btree ("user_id","kind");--> statement-breakpoint
CREATE INDEX "integrations_user_idx" ON "integrations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "users_google_subject_uq" ON "users" USING btree ("google_subject");--> statement-breakpoint
CREATE UNIQUE INDEX "users_email_uq" ON "users" USING btree ("email");