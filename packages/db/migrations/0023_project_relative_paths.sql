ALTER TABLE "stored_files" ADD COLUMN "project_relative_path" text;

-- Existing project uploads did not retain their folder-relative path. Their
-- basename remains available as a root-level fallback for older flat uploads.
UPDATE "stored_files" SET "project_relative_path" = "name"
WHERE "project_id" IS NOT NULL AND "project_relative_path" IS NULL;
