CREATE TABLE "accounts" (
	"user_id" uuid NOT NULL,
	"type" text NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" integer,
	"token_type" text,
	"scope" text,
	"id_token" text,
	"session_state" text
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"session_token" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp with time zone NOT NULL
);
--> statement-breakpoint
DROP INDEX "users_google_subject_uq";--> statement-breakpoint
ALTER TABLE "users" RENAME COLUMN "display_name" TO "name";--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "email_verified" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "image" text;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_account_uq" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
INSERT INTO "accounts" ("user_id", "type", "provider", "provider_account_id")
SELECT "id", 'oauth', 'google', "google_subject" FROM "users"
WHERE "google_subject" IS NOT NULL AND "google_subject" <> ''
ON CONFLICT ("provider", "provider_account_id") DO NOTHING;--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "accounts_user_idx" ON "accounts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "users" DROP COLUMN "google_subject";--> statement-breakpoint
