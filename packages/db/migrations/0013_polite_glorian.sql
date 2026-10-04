ALTER TABLE "attendance_log" ALTER COLUMN "class_date" SET DATA TYPE date USING "class_date"::date;--> statement-breakpoint
ALTER TABLE "attendance_log" ALTER COLUMN "slot" SET DEFAULT '';--> statement-breakpoint
ALTER TABLE "attendance_log" ALTER COLUMN "slot" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "terms" ALTER COLUMN "starts_on" SET DATA TYPE date USING "starts_on"::date;--> statement-breakpoint
ALTER TABLE "terms" ALTER COLUMN "ends_on" SET DATA TYPE date USING "ends_on"::date;
