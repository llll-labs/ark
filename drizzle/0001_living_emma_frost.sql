CREATE TYPE "ark"."file_access_mode" AS ENUM('public', 'space', 'signed_only');--> statement-breakpoint
CREATE TYPE "ark"."file_upload_status" AS ENUM('pending', 'finalized', 'aborted', 'expired');--> statement-breakpoint
CREATE TABLE "ark"."file_uploads" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"file_id" uuid NOT NULL,
	"owner_ark_user_id" uuid,
	"space_id" uuid,
	"storage" text NOT NULL,
	"bucket" text NOT NULL,
	"path" text NOT NULL,
	"original_filename" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" bigint NOT NULL,
	"access_mode" "ark"."file_access_mode" NOT NULL,
	"status" "ark"."file_upload_status" DEFAULT 'pending' NOT NULL,
	"etag" text,
	"expires_at" timestamp with time zone NOT NULL,
	"finalized_at" timestamp with time zone,
	"aborted_at" timestamp with time zone,
	"object_deleted_at" timestamp with time zone,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ark_file_uploads_size_check" CHECK ("ark"."file_uploads"."size_bytes" > 0)
);
--> statement-breakpoint
CREATE TABLE "ark"."resource_definitions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"schema_name" text DEFAULT 'public' NOT NULL,
	"table_name" text NOT NULL,
	"label" text,
	"primary_key" text DEFAULT 'id' NOT NULL,
	"deletion_policy" text DEFAULT 'disabled' NOT NULL,
	"operations_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"fields_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"row_policy_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "ark"."file_variants" ALTER COLUMN "size_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "ark"."files" ALTER COLUMN "size_bytes" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "ark"."files" ADD COLUMN "access_mode" "ark"."file_access_mode" DEFAULT 'space' NOT NULL;--> statement-breakpoint
UPDATE "ark"."files" SET "access_mode" = 'public' WHERE "visibility" = 'public';--> statement-breakpoint
ALTER TABLE "ark"."file_uploads" ADD CONSTRAINT "file_uploads_owner_ark_user_id_users_id_fk" FOREIGN KEY ("owner_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."file_uploads" ADD CONSTRAINT "file_uploads_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ark_file_uploads_file_unique" ON "ark"."file_uploads" USING btree ("file_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_file_uploads_object_unique" ON "ark"."file_uploads" USING btree ("storage","bucket","path");--> statement-breakpoint
CREATE INDEX "ark_file_uploads_owner_status_idx" ON "ark"."file_uploads" USING btree ("owner_ark_user_id","status");--> statement-breakpoint
CREATE INDEX "ark_file_uploads_expiry_idx" ON "ark"."file_uploads" USING btree ("status","expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_resource_definitions_name_unique" ON "ark"."resource_definitions" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_resource_definitions_table_unique" ON "ark"."resource_definitions" USING btree ("schema_name","table_name");--> statement-breakpoint
ALTER TABLE "ark"."files" ADD CONSTRAINT "ark_files_visibility_access_check" CHECK ((
    ("ark"."files"."visibility" = 'public' AND "ark"."files"."access_mode" = 'public') OR
    ("ark"."files"."visibility" <> 'public' AND "ark"."files"."access_mode" <> 'public')
  ));
