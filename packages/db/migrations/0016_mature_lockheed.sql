ALTER TABLE "notification_log" DROP CONSTRAINT "notification_log_feed_item_id_feed_items_id_fk";
--> statement-breakpoint
ALTER TABLE "notification_log" DROP CONSTRAINT "notification_log_reminder_id_reminders_id_fk";
--> statement-breakpoint
CREATE UNIQUE INDEX "feed_items_user_id_uq" ON "feed_items" USING btree ("user_id","id");
--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_user_id_uq" ON "reminders" USING btree ("user_id","id");
--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_feed_fk" FOREIGN KEY ("user_id","feed_item_id") REFERENCES "public"."feed_items"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_log" ADD CONSTRAINT "notification_log_user_reminder_fk" FOREIGN KEY ("user_id","reminder_id") REFERENCES "public"."reminders"("user_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
