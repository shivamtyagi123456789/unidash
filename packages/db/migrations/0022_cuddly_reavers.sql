ALTER TABLE "integrations" ADD COLUMN "secret_ciphertext" text;--> statement-breakpoint
ALTER TABLE "integrations" ADD COLUMN "secret_key_version" integer;