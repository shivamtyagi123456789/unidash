CREATE TABLE "event_sources" (
	"event_id" uuid NOT NULL,
	"source" text NOT NULL,
	"source_ref" text NOT NULL,
	"url" text,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_payload_hash" text,
	CONSTRAINT "event_sources_source_ck" CHECK ("event_sources"."source" IN ('AMS', 'MOODLE', 'WHATSAPP', 'SYSTEM', 'MANUAL'))
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"event_id" uuid NOT NULL,
	"remind_at" timestamp with time zone NOT NULL,
	"offset_label" text,
	"channel" text DEFAULT 'PUSH' NOT NULL,
	"state" text DEFAULT 'PENDING' NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"snoozed_until" timestamp with time zone,
	"sent_at" timestamp with time zone,
	CONSTRAINT "reminders_channel_ck" CHECK ("reminders"."channel" IN ('PUSH', 'IN_APP', 'EMAIL', 'TELEGRAM')),
	CONSTRAINT "reminders_state_ck" CHECK ("reminders"."state" IN ('PENDING', 'SNOOZED', 'SENT', 'SKIPPED', 'FAILED', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"parent_type" text NOT NULL,
	"parent_id" uuid,
	"title" text NOT NULL,
	"due_at" timestamp with time zone,
	"done_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "tasks_parent_type_ck" CHECK ("tasks"."parent_type" IN ('EVENT', 'PROJECT', 'PRESENTATION', 'STANDALONE'))
);
--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_sources_event_source_ref_uq" ON "event_sources" USING btree ("event_id","source","source_ref");--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_event_time_channel_uq" ON "reminders" USING btree ("event_id","remind_at","channel");--> statement-breakpoint
CREATE INDEX "reminders_due_idx" ON "reminders" USING btree ("remind_at") WHERE "reminders"."state" = 'PENDING';--> statement-breakpoint
CREATE INDEX "reminders_user_event_idx" ON "reminders" USING btree ("user_id","event_id");--> statement-breakpoint
CREATE INDEX "tasks_user_parent_idx" ON "tasks" USING btree ("user_id","parent_type","parent_id");
--> statement-breakpoint
INSERT INTO "event_sources" ("event_id", "source", "source_ref")
SELECT "id", "source", "source_ref" FROM "events" WHERE "source_ref" IS NOT NULL
ON CONFLICT ("event_id", "source", "source_ref") DO NOTHING;
