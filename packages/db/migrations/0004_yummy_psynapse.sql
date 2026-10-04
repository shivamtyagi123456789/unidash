CREATE TABLE "idempotency_keys" (
	"user_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "idempotency_keys_user_key_uq" ON "idempotency_keys" USING btree ("user_id","key");--> statement-breakpoint
CREATE INDEX "idempotency_keys_expiry_idx" ON "idempotency_keys" USING btree ("expires_at");