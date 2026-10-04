ALTER TABLE "events" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_deadline" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "is_all_day" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "venue" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "syllabus" text;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "weightage_pct" numeric(5, 2);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "max_marks" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "progress" text DEFAULT 'NOT_STARTED' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "submission_state" text DEFAULT 'UNKNOWN' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "origin" text DEFAULT 'MANUAL' NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "confidence" integer DEFAULT 100 NOT NULL;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_kind_ck" CHECK ("events"."kind" IN ('CLASS', 'LAB_SESSION', 'ASSIGNMENT', 'QUIZ', 'MINOR_EXAM', 'MAJOR_EXAM', 'PRACTICAL_EXAM', 'VIVA', 'PRESENTATION', 'PROJECT_MILESTONE', 'LAB_FILE_SUBMISSION', 'HOLIDAY', 'FEE_DUE', 'NOTICE_DEADLINE', 'PERSONAL', 'OTHER'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_source_ck" CHECK ("events"."source" IN ('AMS', 'MOODLE', 'WHATSAPP', 'SYSTEM', 'MANUAL'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_status_ck" CHECK ("events"."status" IN ('TENTATIVE', 'CONFIRMED', 'CANCELLED'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_progress_ck" CHECK ("events"."progress" IN ('NOT_STARTED', 'IN_PROGRESS', 'DONE', 'SKIPPED'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_submission_state_ck" CHECK ("events"."submission_state" IN ('UNKNOWN', 'NOT_SUBMITTED', 'SUBMITTED', 'GRADED'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_origin_ck" CHECK ("events"."origin" IN ('SOURCE', 'INFERRED', 'MANUAL'));--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_confidence_ck" CHECK ("events"."confidence" BETWEEN 0 AND 100);