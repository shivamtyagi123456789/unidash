CREATE TABLE "feed_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"severity" text DEFAULT 'NORMAL' NOT NULL,
	"subject_id" uuid,
	"event_id" uuid,
	"title" text NOT NULL,
	"body" text,
	"icon" text,
	"payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"group_key" text,
	"dedupe_key" text NOT NULL,
	"read_at" timestamp with time zone,
	"pinned_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feed_items_kind_ck" CHECK ("feed_items"."kind" IN ('ATTENDANCE_CHANGED', 'ATTENDANCE_RISK', 'GRADE_POSTED', 'GRADE_CHANGED', 'NOTICE_POSTED', 'EXAM_SCHEDULED', 'EXAM_RESCHEDULED', 'EXAM_CANCELLED', 'EXAM_CLASH', 'ASSIGNMENT_POSTED', 'ASSIGNMENT_DUE_CHANGED', 'QUIZ_POSTED', 'QUIZ_WINDOW_CHANGED', 'SUBMISSION_STATUS_CHANGED', 'RESOURCE_ADDED', 'RESOURCE_UPDATED', 'FORUM_ANNOUNCEMENT', 'TIMETABLE_CHANGED', 'CLASS_CANCELLED', 'FEE_DUE', 'WA_TRACKED_MESSAGE', 'WA_KEYWORD_ALERT', 'WA_FILE_SHARED', 'EVENT_PROPOSED', 'REMINDER', 'DIGEST', 'CRUNCH_WARNING', 'INTEGRATION_ATTENTION', 'INITIAL_IMPORT')),
	CONSTRAINT "feed_items_source_ck" CHECK ("feed_items"."source" IN ('AMS', 'MOODLE', 'WHATSAPP', 'SYSTEM')),
	CONSTRAINT "feed_items_severity_ck" CHECK ("feed_items"."severity" IN ('INFO', 'NORMAL', 'IMPORTANT', 'CRITICAL'))
);
--> statement-breakpoint
CREATE TABLE "notification_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"feed_item_id" uuid,
	"reminder_id" uuid,
	"channel" text NOT NULL,
	"status" text NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	CONSTRAINT "notification_log_status_ck" CHECK ("notification_log"."status" IN ('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED'))
);
--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_user_subject_fk" FOREIGN KEY ("user_id","subject_id") REFERENCES "public"."subjects"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feed_items" ADD CONSTRAINT "feed_items_user_event_fk" FOREIGN KEY ("user_id","event_id") REFERENCES "public"."events"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_feed_item_id_feed_items_id_fk" FOREIGN KEY ("feed_item_id") REFERENCES "public"."feed_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_user_dedupe_uq" ON "feed_items" USING btree ("user_id","dedupe_key");--> statement-breakpoint
CREATE INDEX "feed_items_user_time_idx" ON "feed_items" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "notification_log_feed_channel_uq" ON "notification_log" USING btree ("feed_item_id","channel");--> statement-breakpoint
CREATE INDEX "notification_log_user_idx" ON "notification_log" USING btree ("user_id");