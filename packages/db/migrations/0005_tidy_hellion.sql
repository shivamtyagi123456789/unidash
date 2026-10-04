ALTER TABLE "events" ALTER COLUMN "updated_at" SET DATA TYPE timestamp (3) with time zone;--> statement-breakpoint
ALTER TABLE "events" ALTER COLUMN "updated_at" SET DEFAULT now();