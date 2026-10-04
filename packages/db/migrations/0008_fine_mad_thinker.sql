CREATE TABLE "attendance_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"class_date" text NOT NULL,
	"slot" text,
	"status" text NOT NULL,
	CONSTRAINT "attendance_log_status_ck" CHECK ("attendance_log"."status" IN ('PRESENT', 'ABSENT', 'LATE', 'LEAVE', 'CANCELLED'))
);
--> statement-breakpoint
CREATE TABLE "attendance_summary" (
	"user_id" uuid NOT NULL,
	"subject_id" uuid NOT NULL,
	"attended" integer NOT NULL,
	"total" integer NOT NULL,
	"percentage" numeric(5, 2) NOT NULL,
	"as_of" timestamp with time zone DEFAULT now() NOT NULL,
	"source" text NOT NULL,
	CONSTRAINT "attendance_summary_counts_ck" CHECK ("attendance_summary"."attended" >= 0 AND "attendance_summary"."total" >= "attendance_summary"."attended")
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"term_id" uuid NOT NULL,
	"code" text,
	"name" text NOT NULL,
	"aliases" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"faculty_name" text,
	"credits" numeric(3, 1),
	"kind" text DEFAULT 'THEORY' NOT NULL,
	"color" text,
	"moodle_course_id" integer,
	"ams_ref" text,
	"is_active" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"label" text NOT NULL,
	"starts_on" text,
	"ends_on" text,
	"is_current" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_log" ADD CONSTRAINT "attendance_log_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_summary" ADD CONSTRAINT "attendance_summary_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_summary" ADD CONSTRAINT "attendance_summary_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "subjects" ADD CONSTRAINT "subjects_term_id_terms_id_fk" FOREIGN KEY ("term_id") REFERENCES "public"."terms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "terms" ADD CONSTRAINT "terms_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_log_user_subject_date_slot_uq" ON "attendance_log" USING btree ("user_id","subject_id","class_date","slot");--> statement-breakpoint
CREATE UNIQUE INDEX "attendance_summary_user_subject_uq" ON "attendance_summary" USING btree ("user_id","subject_id");--> statement-breakpoint
CREATE INDEX "subjects_user_term_idx" ON "subjects" USING btree ("user_id","term_id");--> statement-breakpoint
CREATE INDEX "terms_user_idx" ON "terms" USING btree ("user_id");