DROP INDEX "file_folders_user_parent_name_uq";--> statement-breakpoint
ALTER TABLE "file_folders" ADD COLUMN "drive_folder_id" text NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "file_folders_user_root_name_uq" ON "file_folders" USING btree ("user_id","name") WHERE "file_folders"."parent_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "file_folders_user_parent_name_uq" ON "file_folders" USING btree ("user_id","parent_id","name") WHERE "file_folders"."parent_id" IS NOT NULL;
