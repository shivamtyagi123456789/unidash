ALTER TABLE "attendance_log" DROP CONSTRAINT "attendance_log_subject_id_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_summary" DROP CONSTRAINT "attendance_summary_subject_id_subjects_id_fk";
--> statement-breakpoint
ALTER TABLE "event_sources" DROP CONSTRAINT "event_sources_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "reminders" DROP CONSTRAINT "reminders_event_id_events_id_fk";
--> statement-breakpoint
ALTER TABLE "subjects" DROP CONSTRAINT "subjects_term_id_terms_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "events_user_id_uq" ON "events" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "subjects_user_id_uq" ON "subjects" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "terms_user_id_uq" ON "terms" USING btree ("user_id","id");--> statement-breakpoint
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_user_subject_fk" FOREIGN KEY ("user_id","subject_id") REFERENCES "public"."subjects"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_summary" ADD CONSTRAINT "attendance_summary_user_subject_fk" FOREIGN KEY ("user_id","subject_id") REFERENCES "public"."subjects"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_sources" ADD CONSTRAINT "event_sources_event_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_event_fk" FOREIGN KEY ("user_id","event_id") REFERENCES "public"."events"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_user_term_fk" FOREIGN KEY ("user_id","term_id") REFERENCES "public"."terms"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_summary" ADD CONSTRAINT "attendance_summary_percentage_ck" CHECK ("attendance_summary"."percentage" BETWEEN 0 AND 100);
