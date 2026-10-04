CREATE TABLE "portal_scans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"source" text NOT NULL,
	"scan_id" text NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"trusted" boolean NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "portal_scans_source_ck" CHECK ("portal_scans"."source" IN ('AMS', 'MOODLE'))
);
--> statement-breakpoint
ALTER TABLE "portal_scans" ADD CONSTRAINT "portal_scans_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "portal_scans_user_source_scan_uq" ON "portal_scans" USING btree ("user_id","source","scan_id");--> statement-breakpoint
CREATE INDEX "portal_scans_user_source_latest_idx" ON "portal_scans" USING btree ("user_id","source","finished_at");--> statement-breakpoint
UPDATE "integrations" SET "status" = 'NOT_CONNECTED', "last_success_at" = NULL, "last_error_code" = NULL, "last_error_message" = NULL, "metadata" = '{}'::jsonb, "updated_at" = now() WHERE "kind" = 'MOODLE' AND "secret_ciphertext" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "integrations" DROP COLUMN "secret_ciphertext";--> statement-breakpoint
ALTER TABLE "integrations" DROP COLUMN "secret_key_version";
