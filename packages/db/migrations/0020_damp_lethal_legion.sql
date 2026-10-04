ALTER TABLE "users" ALTER COLUMN "email_verified" SET DATA TYPE boolean USING "email_verified" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET DEFAULT false;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "email_verified" SET NOT NULL;
