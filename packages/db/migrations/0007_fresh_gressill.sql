CREATE TABLE "event_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	"field" text NOT NULL,
	"old_value" jsonb,
	"new_value" jsonb,
	"summary" text
);
--> statement-breakpoint
ALTER TABLE "event_history" ADD CONSTRAINT "event_history_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_history_event_changed_idx" ON "event_history" USING btree ("event_id","changed_at");