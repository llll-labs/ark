ALTER TABLE "ark"."file_uploads" DROP CONSTRAINT "file_uploads_owner_ark_user_id_users_id_fk";
--> statement-breakpoint
ALTER TABLE "ark"."file_uploads" DROP CONSTRAINT "file_uploads_space_id_spaces_id_fk";
--> statement-breakpoint
ALTER TABLE "ark"."file_uploads" ALTER COLUMN "owner_ark_user_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ark"."file_uploads" ALTER COLUMN "space_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "ark"."file_uploads" ADD COLUMN "object_deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "ark"."file_uploads" ADD CONSTRAINT "file_uploads_owner_ark_user_id_users_id_fk" FOREIGN KEY ("owner_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."file_uploads" ADD CONSTRAINT "file_uploads_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
UPDATE "ark"."files" SET "access_mode" = 'public' WHERE "visibility" = 'public';--> statement-breakpoint
ALTER TABLE "ark"."files" ADD CONSTRAINT "ark_files_visibility_access_check" CHECK ((
    ("ark"."files"."visibility" = 'public' AND "ark"."files"."access_mode" = 'public') OR
    ("ark"."files"."visibility" <> 'public' AND "ark"."files"."access_mode" <> 'public')
  ));
