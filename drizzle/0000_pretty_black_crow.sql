CREATE OR REPLACE FUNCTION uuidv7() RETURNS uuid AS $$
  SELECT encode(
    set_bit(
      set_bit(
        overlay(uuid_send(gen_random_uuid())
                placing substring(int8send(floor(extract(epoch from clock_timestamp()) * 1000)::bigint) from 3)
                from 1 for 6),
        52, 1),
      53, 1),
    'hex')::uuid;
$$ LANGUAGE sql VOLATILE;--> statement-breakpoint
CREATE SCHEMA "ark";
--> statement-breakpoint
CREATE TYPE "ark"."user_kind" AS ENUM('human', 'integration', 'system');--> statement-breakpoint
CREATE TYPE "ark"."channel_kind" AS ENUM('chat', 'forum', 'announcement', 'thread', 'dm', 'job_discussion', 'feed');--> statement-breakpoint
CREATE TYPE "ark"."channel_member_status" AS ENUM('active', 'invited', 'muted', 'left', 'blocked');--> statement-breakpoint
CREATE TYPE "ark"."field_slot_kind" AS ENUM('text', 'number', 'date', 'boolean', 'select', 'json');--> statement-breakpoint
CREATE TYPE "ark"."field_type" AS ENUM('boolean', 'created_by', 'created_time', 'date', 'email', 'external_relation', 'file', 'files', 'json', 'last_edited_by', 'last_edited_time', 'multi_select', 'number', 'people', 'phone_number', 'place', 'relation', 'select', 'status', 'text', 'unique_id', 'url', 'user', 'verification');--> statement-breakpoint
CREATE TYPE "ark"."grant_effect" AS ENUM('allow', 'deny');--> statement-breakpoint
CREATE TYPE "ark"."grant_subject_type" AS ENUM('anon', 'authenticated', 'ark_user', 'role', 'membership');--> statement-breakpoint
CREATE TYPE "ark"."market_job_curation_status" AS ENUM('parsed', 'approved', 'hidden');--> statement-breakpoint
CREATE TYPE "ark"."market_job_status" AS ENUM('draft', 'open', 'responding', 'ordered', 'completed', 'archived');--> statement-breakpoint
CREATE TYPE "ark"."market_store_status" AS ENUM('draft', 'pending_review', 'active', 'rejected', 'suspended');--> statement-breakpoint
CREATE TYPE "ark"."membership_status" AS ENUM('pending', 'active', 'suspended', 'blocked');--> statement-breakpoint
CREATE TYPE "ark"."message_kind" AS ENUM('message', 'comment', 'system');--> statement-breakpoint
CREATE TYPE "ark"."message_relation_kind" AS ENUM('attachment', 'reply_quote', 'forum_parent', 'user_mention', 'channel_mention', 'role_mention', 'job_reference', 'collection_reference', 'item_reference', 'page_reference');--> statement-breakpoint
CREATE TYPE "ark"."message_relation_target_type" AS ENUM('ark_user', 'channel', 'file', 'item', 'job', 'message', 'page', 'role', 'space');--> statement-breakpoint
CREATE TYPE "ark"."notification_status" AS ENUM('queued', 'sent', 'skipped', 'failed');--> statement-breakpoint
CREATE TYPE "ark"."page_kind" AS ENUM('group', 'component', 'collection', 'view', 'item', 'channel', 'external');--> statement-breakpoint
CREATE TYPE "ark"."response_pricing_mode" AS ENUM('free', 'paid_response', 'success_fee', 'manual');--> statement-breakpoint
CREATE TYPE "ark"."scope_type" AS ENUM('global', 'space', 'channel', 'job', 'collection', 'item', 'page');--> statement-breakpoint
CREATE TYPE "ark"."space_kind" AS ENUM('public_square', 'private', 'organization', 'admin', 'studio', 'task', 'system');--> statement-breakpoint
CREATE TYPE "ark"."visibility" AS ENUM('public', 'registered', 'space', 'private');--> statement-breakpoint
CREATE TABLE "ark"."auth_accounts" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"account_id" text NOT NULL,
	"provider_id" text NOT NULL,
	"user_id" uuid NOT NULL,
	"access_token" text,
	"refresh_token" text,
	"id_token" text,
	"access_token_expires_at" timestamp with time zone,
	"refresh_token_expires_at" timestamp with time zone,
	"scope" text,
	"password" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ark"."settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"key" text DEFAULT 'main' NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"logo_file_id" uuid,
	"icon_file_id" uuid,
	"primary_color" text DEFAULT '#0f766e' NOT NULL,
	"accent_color" text DEFAULT '#f59e0b' NOT NULL,
	"theme_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"auth_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"onboarding_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"portal_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"data_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"auth_user_id" uuid,
	"kind" "ark"."user_kind" DEFAULT 'human' NOT NULL,
	"handle" text,
	"display_name" text NOT NULL,
	"avatar_file_id" uuid,
	"bio" text,
	"profile_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."auth_sessions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"token" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ip_address" text,
	"user_agent" text,
	"user_id" uuid NOT NULL,
	CONSTRAINT "auth_sessions_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "ark"."auth_users" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"email_verified" boolean DEFAULT false NOT NULL,
	"image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "auth_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "ark"."auth_verifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"identifier" text NOT NULL,
	"value" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ark"."channel_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"position" integer DEFAULT 0 NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."channel_members" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"channel_id" uuid NOT NULL,
	"ark_user_id" uuid NOT NULL,
	"role" text DEFAULT 'member' NOT NULL,
	"status" "ark"."channel_member_status" DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."channels" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"category_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"kind" "ark"."channel_kind" DEFAULT 'chat' NOT NULL,
	"visibility" "ark"."visibility" DEFAULT 'space' NOT NULL,
	"identity_key" text,
	"position" integer DEFAULT 0 NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"topic" text,
	"thread_parent_channel_id" uuid,
	"thread_root_message_id" uuid,
	"last_message_at" timestamp with time zone,
	"last_message_preview" text,
	"messages_count" integer DEFAULT 0 NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_ark_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ark_channels_ark_space_id_unique" UNIQUE("space_id","id"),
	CONSTRAINT "ark_channels_private_membership_check" CHECK ("ark"."channels"."visibility" <> 'private' or "ark"."channels"."kind" in ('dm', 'chat', 'job_discussion', 'thread')),
	CONSTRAINT "ark_channels_thread_owner_check" CHECK (
    ("ark"."channels"."kind" = 'thread' and "ark"."channels"."thread_parent_channel_id" is not null and "ark"."channels"."thread_root_message_id" is not null)
    or ("ark"."channels"."kind" <> 'thread' and "ark"."channels"."thread_parent_channel_id" is null and "ark"."channels"."thread_root_message_id" is null)
  )
);
--> statement-breakpoint
CREATE TABLE "ark"."collections" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"icon" text,
	"created_by_ark_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ark_collections_ark_space_id_unique" UNIQUE("space_id","id")
);
--> statement-breakpoint
CREATE TABLE "ark"."fields" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"collection_id" uuid NOT NULL,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"type" "ark"."field_type" DEFAULT 'text' NOT NULL,
	"slot_kind" "ark"."field_slot_kind",
	"slot_index" integer,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ark_fields_slot_index_check" CHECK ("ark"."fields"."slot_index" is null or "ark"."fields"."slot_index" > 0)
);
--> statement-breakpoint
CREATE TABLE "ark"."file_variants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"file_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"storage" text DEFAULT 'private' NOT NULL,
	"bucket" text DEFAULT 'ark-files-private' NOT NULL,
	"path" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."files" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_ark_user_id" uuid,
	"storage" text DEFAULT 'private' NOT NULL,
	"bucket" text DEFAULT 'ark-files-private' NOT NULL,
	"path" text NOT NULL,
	"filename" text NOT NULL,
	"original_filename" text,
	"mime_type" text NOT NULL,
	"size_bytes" integer DEFAULT 0 NOT NULL,
	"width" integer,
	"height" integer,
	"checksum" text,
	"visibility" "ark"."visibility" DEFAULT 'private' NOT NULL,
	"metadata_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."grants" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"subject_type" "ark"."grant_subject_type" NOT NULL,
	"subject_id" uuid,
	"scope_type" "ark"."scope_type" DEFAULT 'global' NOT NULL,
	"scope_id" uuid,
	"entity_type" text,
	"action" text NOT NULL,
	"effect" "ark"."grant_effect" DEFAULT 'allow' NOT NULL,
	"condition_json" jsonb,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ark_grants_subject_check" CHECK (
    ("ark"."grants"."subject_type" in ('anon', 'authenticated') and "ark"."grants"."subject_id" is null)
    or ("ark"."grants"."subject_type" in ('ark_user', 'role', 'membership') and "ark"."grants"."subject_id" is not null)
  )
);
--> statement-breakpoint
CREATE TABLE "ark"."items" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"collection_id" uuid,
	"parent_item_id" uuid,
	"root_item_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"body_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"title" text DEFAULT 'Untitled' NOT NULL,
	"summary" text,
	"kind" text DEFAULT 'item' NOT NULL,
	"visibility" "ark"."visibility" DEFAULT 'space' NOT NULL,
	"data_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_by_ark_user_id" uuid,
	"assigned_ark_user_id" uuid,
	"due_at" timestamp with time zone,
	"source_url" text,
	"text_001" text,
	"text_002" text,
	"text_003" text,
	"text_004" text,
	"text_005" text,
	"text_006" text,
	"text_007" text,
	"text_008" text,
	"text_009" text,
	"text_010" text,
	"text_011" text,
	"text_012" text,
	"text_013" text,
	"text_014" text,
	"text_015" text,
	"text_016" text,
	"text_017" text,
	"text_018" text,
	"text_019" text,
	"text_020" text,
	"text_021" text,
	"text_022" text,
	"text_023" text,
	"text_024" text,
	"text_025" text,
	"text_026" text,
	"text_027" text,
	"text_028" text,
	"text_029" text,
	"text_030" text,
	"text_031" text,
	"text_032" text,
	"text_033" text,
	"text_034" text,
	"text_035" text,
	"text_036" text,
	"text_037" text,
	"text_038" text,
	"text_039" text,
	"text_040" text,
	"text_041" text,
	"text_042" text,
	"text_043" text,
	"text_044" text,
	"text_045" text,
	"text_046" text,
	"text_047" text,
	"text_048" text,
	"text_049" text,
	"text_050" text,
	"text_051" text,
	"text_052" text,
	"text_053" text,
	"text_054" text,
	"text_055" text,
	"text_056" text,
	"text_057" text,
	"text_058" text,
	"text_059" text,
	"text_060" text,
	"text_061" text,
	"text_062" text,
	"text_063" text,
	"text_064" text,
	"text_065" text,
	"text_066" text,
	"text_067" text,
	"text_068" text,
	"text_069" text,
	"text_070" text,
	"text_071" text,
	"text_072" text,
	"text_073" text,
	"text_074" text,
	"text_075" text,
	"text_076" text,
	"text_077" text,
	"text_078" text,
	"text_079" text,
	"text_080" text,
	"text_081" text,
	"text_082" text,
	"text_083" text,
	"text_084" text,
	"text_085" text,
	"text_086" text,
	"text_087" text,
	"text_088" text,
	"text_089" text,
	"text_090" text,
	"text_091" text,
	"text_092" text,
	"text_093" text,
	"text_094" text,
	"text_095" text,
	"text_096" text,
	"number_001" numeric(18, 6),
	"number_002" numeric(18, 6),
	"number_003" numeric(18, 6),
	"number_004" numeric(18, 6),
	"number_005" numeric(18, 6),
	"number_006" numeric(18, 6),
	"number_007" numeric(18, 6),
	"number_008" numeric(18, 6),
	"number_009" numeric(18, 6),
	"number_010" numeric(18, 6),
	"number_011" numeric(18, 6),
	"number_012" numeric(18, 6),
	"number_013" numeric(18, 6),
	"number_014" numeric(18, 6),
	"number_015" numeric(18, 6),
	"number_016" numeric(18, 6),
	"number_017" numeric(18, 6),
	"number_018" numeric(18, 6),
	"number_019" numeric(18, 6),
	"number_020" numeric(18, 6),
	"number_021" numeric(18, 6),
	"number_022" numeric(18, 6),
	"number_023" numeric(18, 6),
	"number_024" numeric(18, 6),
	"number_025" numeric(18, 6),
	"number_026" numeric(18, 6),
	"number_027" numeric(18, 6),
	"number_028" numeric(18, 6),
	"number_029" numeric(18, 6),
	"number_030" numeric(18, 6),
	"number_031" numeric(18, 6),
	"number_032" numeric(18, 6),
	"date_001" timestamp with time zone,
	"date_002" timestamp with time zone,
	"date_003" timestamp with time zone,
	"date_004" timestamp with time zone,
	"date_005" timestamp with time zone,
	"date_006" timestamp with time zone,
	"date_007" timestamp with time zone,
	"date_008" timestamp with time zone,
	"date_009" timestamp with time zone,
	"date_010" timestamp with time zone,
	"date_011" timestamp with time zone,
	"date_012" timestamp with time zone,
	"date_013" timestamp with time zone,
	"date_014" timestamp with time zone,
	"date_015" timestamp with time zone,
	"date_016" timestamp with time zone,
	"date_017" timestamp with time zone,
	"date_018" timestamp with time zone,
	"date_019" timestamp with time zone,
	"date_020" timestamp with time zone,
	"date_021" timestamp with time zone,
	"date_022" timestamp with time zone,
	"date_023" timestamp with time zone,
	"date_024" timestamp with time zone,
	"date_025" timestamp with time zone,
	"date_026" timestamp with time zone,
	"date_027" timestamp with time zone,
	"date_028" timestamp with time zone,
	"date_029" timestamp with time zone,
	"date_030" timestamp with time zone,
	"date_031" timestamp with time zone,
	"date_032" timestamp with time zone,
	"boolean_001" boolean,
	"boolean_002" boolean,
	"boolean_003" boolean,
	"boolean_004" boolean,
	"boolean_005" boolean,
	"boolean_006" boolean,
	"boolean_007" boolean,
	"boolean_008" boolean,
	"boolean_009" boolean,
	"boolean_010" boolean,
	"boolean_011" boolean,
	"boolean_012" boolean,
	"boolean_013" boolean,
	"boolean_014" boolean,
	"boolean_015" boolean,
	"boolean_016" boolean,
	"boolean_017" boolean,
	"boolean_018" boolean,
	"boolean_019" boolean,
	"boolean_020" boolean,
	"boolean_021" boolean,
	"boolean_022" boolean,
	"boolean_023" boolean,
	"boolean_024" boolean,
	"boolean_025" boolean,
	"boolean_026" boolean,
	"boolean_027" boolean,
	"boolean_028" boolean,
	"boolean_029" boolean,
	"boolean_030" boolean,
	"boolean_031" boolean,
	"boolean_032" boolean,
	"select_001" text,
	"select_002" text,
	"select_003" text,
	"select_004" text,
	"select_005" text,
	"select_006" text,
	"select_007" text,
	"select_008" text,
	"select_009" text,
	"select_010" text,
	"select_011" text,
	"select_012" text,
	"select_013" text,
	"select_014" text,
	"select_015" text,
	"select_016" text,
	"select_017" text,
	"select_018" text,
	"select_019" text,
	"select_020" text,
	"select_021" text,
	"select_022" text,
	"select_023" text,
	"select_024" text,
	"select_025" text,
	"select_026" text,
	"select_027" text,
	"select_028" text,
	"select_029" text,
	"select_030" text,
	"select_031" text,
	"select_032" text,
	"json_001" jsonb,
	"json_002" jsonb,
	"json_003" jsonb,
	"json_004" jsonb,
	"json_005" jsonb,
	"json_006" jsonb,
	"json_007" jsonb,
	"json_008" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ark_items_position_check" CHECK ("ark"."items"."position" >= 0)
);
--> statement-breakpoint
CREATE TABLE "ark"."market_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_job_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"job_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_job_skills" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"job_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_job_styles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"job_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_job_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"job_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_job_tools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"job_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_jobs" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"title" text NOT NULL,
	"summary" text,
	"description" text,
	"kind" text DEFAULT 'unknown' NOT NULL,
	"status" "ark"."market_job_status" DEFAULT 'draft' NOT NULL,
	"curation_status" "ark"."market_job_curation_status" DEFAULT 'parsed' NOT NULL,
	"rating" integer,
	"rating_reason" text,
	"ai_confidence" real,
	"primary_category_id" uuid,
	"budget_amount" numeric(12, 2),
	"budget_min" numeric(12, 2),
	"budget_max" numeric(12, 2),
	"budget_currency" text,
	"location" text,
	"timezone" text,
	"remote" boolean DEFAULT true NOT NULL,
	"response_pricing_mode" "ark"."response_pricing_mode" DEFAULT 'free' NOT NULL,
	"response_fee_amount" numeric(12, 2),
	"response_fee_currency" text,
	"commission_amount" numeric(12, 2),
	"commission_currency" text,
	"source" text,
	"source_url" text,
	"external_id" text,
	"source_locale" text DEFAULT 'unknown' NOT NULL,
	"contact_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"source_raw_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"workflow_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"discussion_channel_id" uuid,
	"created_by_ark_user_id" uuid,
	"source_published_at" timestamp with time zone,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_skills" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_store_categories" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"store_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_store_skills" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"store_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_store_styles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"store_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_store_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"store_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_store_tools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"store_id" uuid NOT NULL,
	"target_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_stores" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"owner_space_id" uuid NOT NULL,
	"status" "ark"."market_store_status" DEFAULT 'pending_review' NOT NULL,
	"name" text NOT NULL,
	"headline" text,
	"bio" text,
	"timezone" text,
	"location" text,
	"remote" boolean DEFAULT true NOT NULL,
	"availability" text,
	"portfolio_url" text,
	"service_summary" text,
	"rate_amount" numeric(12, 2),
	"rate_currency" text,
	"rate_unit" text,
	"verification_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"rating_average" numeric(4, 2) DEFAULT '0' NOT NULL,
	"reviews_count" integer DEFAULT 0 NOT NULL,
	"meta_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"submitted_at" timestamp with time zone,
	"reviewed_at" timestamp with time zone,
	"reviewed_by_ark_user_id" uuid,
	"review_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_styles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_tags" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."market_tools" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"group" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."membership_roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"membership_id" uuid NOT NULL,
	"role_id" uuid NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."memberships" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ark_user_id" uuid NOT NULL,
	"scope_type" "ark"."scope_type" NOT NULL,
	"scope_id" uuid NOT NULL,
	"role_id" uuid,
	"status" "ark"."membership_status" DEFAULT 'pending' NOT NULL,
	"joined_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."message_pins" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"channel_id" uuid NOT NULL,
	"message_id" uuid NOT NULL,
	"pinned_by_ark_user_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."message_reactions" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"message_id" uuid NOT NULL,
	"ark_user_id" uuid NOT NULL,
	"emoji" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."message_relations" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"message_id" uuid NOT NULL,
	"relation_type" "ark"."message_relation_kind" NOT NULL,
	"target_type" "ark"."message_relation_target_type" NOT NULL,
	"target_id" uuid,
	"target_collection_key" text,
	"target_record_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."messages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"root_message_id" uuid,
	"kind" "ark"."message_kind" DEFAULT 'message' NOT NULL,
	"author_ark_user_id" uuid,
	"body" text,
	"body_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "ark_messages_ark_channel_id_unique" UNIQUE("channel_id","id")
);
--> statement-breakpoint
CREATE TABLE "ark"."notifications" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"kind" text NOT NULL,
	"status" "ark"."notification_status" DEFAULT 'queued' NOT NULL,
	"channel" text DEFAULT 'telegram' NOT NULL,
	"target_type" text,
	"target_id" uuid,
	"recipient_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"payload_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"result_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"error" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."pages" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"parent_page_id" uuid,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"icon" text,
	"kind" "ark"."page_kind" DEFAULT 'group' NOT NULL,
	"component_name" text,
	"target_type" text,
	"target_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."roles" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"scope_type" "ark"."scope_type" DEFAULT 'global' NOT NULL,
	"scope_id" uuid,
	"key" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"is_system" boolean DEFAULT false NOT NULL,
	"rank" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."spaces" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"parent_space_id" uuid,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"kind" "ark"."space_kind" DEFAULT 'private' NOT NULL,
	"visibility" "ark"."visibility" DEFAULT 'private' NOT NULL,
	"inherit_access" boolean DEFAULT true NOT NULL,
	"is_default" boolean DEFAULT false NOT NULL,
	"owner_ark_user_id" uuid,
	"status" text DEFAULT 'active' NOT NULL,
	"settings_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."user_channel_states" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ark_user_id" uuid NOT NULL,
	"channel_id" uuid NOT NULL,
	"last_read_at" timestamp with time zone,
	"last_seen_message_id" uuid,
	"unread_count" integer DEFAULT 0 NOT NULL,
	"mention_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."user_settings" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"ark_user_id" uuid NOT NULL,
	"appearance_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notifications_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"privacy_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"agent_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "ark"."views" (
	"id" uuid PRIMARY KEY DEFAULT uuidv7() NOT NULL,
	"space_id" uuid NOT NULL,
	"collection_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"kind" text DEFAULT 'table' NOT NULL,
	"config_json" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "ark"."auth_accounts" ADD CONSTRAINT "auth_accounts_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ark"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."settings" ADD CONSTRAINT "settings_logo_file_id_files_id_fk" FOREIGN KEY ("logo_file_id") REFERENCES "ark"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."settings" ADD CONSTRAINT "settings_icon_file_id_files_id_fk" FOREIGN KEY ("icon_file_id") REFERENCES "ark"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."users" ADD CONSTRAINT "users_auth_user_id_auth_users_id_fk" FOREIGN KEY ("auth_user_id") REFERENCES "ark"."auth_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."users" ADD CONSTRAINT "users_avatar_file_id_files_id_fk" FOREIGN KEY ("avatar_file_id") REFERENCES "ark"."files"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."auth_sessions" ADD CONSTRAINT "auth_sessions_user_id_auth_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "ark"."auth_users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."channel_categories" ADD CONSTRAINT "channel_categories_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."channel_members" ADD CONSTRAINT "channel_members_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "ark"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."channel_members" ADD CONSTRAINT "channel_members_ark_user_id_users_id_fk" FOREIGN KEY ("ark_user_id") REFERENCES "ark"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."channels" ADD CONSTRAINT "channels_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."channels" ADD CONSTRAINT "channels_category_id_channel_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "ark"."channel_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."channels" ADD CONSTRAINT "channels_thread_parent_channel_id_channels_id_fk" FOREIGN KEY ("thread_parent_channel_id") REFERENCES "ark"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."channels" ADD CONSTRAINT "channels_thread_root_message_id_messages_id_fk" FOREIGN KEY ("thread_root_message_id") REFERENCES "ark"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."channels" ADD CONSTRAINT "channels_created_by_ark_user_id_users_id_fk" FOREIGN KEY ("created_by_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."collections" ADD CONSTRAINT "collections_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."collections" ADD CONSTRAINT "collections_created_by_ark_user_id_users_id_fk" FOREIGN KEY ("created_by_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."fields" ADD CONSTRAINT "fields_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "ark"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."file_variants" ADD CONSTRAINT "file_variants_file_id_files_id_fk" FOREIGN KEY ("file_id") REFERENCES "ark"."files"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."files" ADD CONSTRAINT "files_owner_ark_user_id_users_id_fk" FOREIGN KEY ("owner_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."items" ADD CONSTRAINT "items_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."items" ADD CONSTRAINT "items_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "ark"."collections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."items" ADD CONSTRAINT "items_parent_item_id_items_id_fk" FOREIGN KEY ("parent_item_id") REFERENCES "ark"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."items" ADD CONSTRAINT "items_root_item_id_items_id_fk" FOREIGN KEY ("root_item_id") REFERENCES "ark"."items"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."items" ADD CONSTRAINT "items_created_by_ark_user_id_users_id_fk" FOREIGN KEY ("created_by_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."items" ADD CONSTRAINT "items_assigned_ark_user_id_users_id_fk" FOREIGN KEY ("assigned_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_categories" ADD CONSTRAINT "market_job_categories_job_id_market_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "ark"."market_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_categories" ADD CONSTRAINT "market_job_categories_target_id_market_categories_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_skills" ADD CONSTRAINT "market_job_skills_job_id_market_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "ark"."market_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_skills" ADD CONSTRAINT "market_job_skills_target_id_market_skills_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_styles" ADD CONSTRAINT "market_job_styles_job_id_market_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "ark"."market_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_styles" ADD CONSTRAINT "market_job_styles_target_id_market_styles_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_tags" ADD CONSTRAINT "market_job_tags_job_id_market_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "ark"."market_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_tags" ADD CONSTRAINT "market_job_tags_target_id_market_tags_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_tools" ADD CONSTRAINT "market_job_tools_job_id_market_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "ark"."market_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_job_tools" ADD CONSTRAINT "market_job_tools_target_id_market_tools_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_jobs" ADD CONSTRAINT "market_jobs_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_jobs" ADD CONSTRAINT "market_jobs_primary_category_id_market_categories_id_fk" FOREIGN KEY ("primary_category_id") REFERENCES "ark"."market_categories"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_jobs" ADD CONSTRAINT "market_jobs_discussion_channel_id_channels_id_fk" FOREIGN KEY ("discussion_channel_id") REFERENCES "ark"."channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_jobs" ADD CONSTRAINT "market_jobs_created_by_ark_user_id_users_id_fk" FOREIGN KEY ("created_by_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_categories" ADD CONSTRAINT "market_store_categories_store_id_market_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "ark"."market_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_categories" ADD CONSTRAINT "market_store_categories_target_id_market_categories_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_categories"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_skills" ADD CONSTRAINT "market_store_skills_store_id_market_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "ark"."market_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_skills" ADD CONSTRAINT "market_store_skills_target_id_market_skills_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_skills"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_styles" ADD CONSTRAINT "market_store_styles_store_id_market_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "ark"."market_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_styles" ADD CONSTRAINT "market_store_styles_target_id_market_styles_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_styles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_tags" ADD CONSTRAINT "market_store_tags_store_id_market_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "ark"."market_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_tags" ADD CONSTRAINT "market_store_tags_target_id_market_tags_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_tags"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_tools" ADD CONSTRAINT "market_store_tools_store_id_market_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "ark"."market_stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_store_tools" ADD CONSTRAINT "market_store_tools_target_id_market_tools_id_fk" FOREIGN KEY ("target_id") REFERENCES "ark"."market_tools"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_stores" ADD CONSTRAINT "market_stores_owner_space_id_spaces_id_fk" FOREIGN KEY ("owner_space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."market_stores" ADD CONSTRAINT "market_stores_reviewed_by_ark_user_id_users_id_fk" FOREIGN KEY ("reviewed_by_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."membership_roles" ADD CONSTRAINT "membership_roles_membership_id_memberships_id_fk" FOREIGN KEY ("membership_id") REFERENCES "ark"."memberships"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."membership_roles" ADD CONSTRAINT "membership_roles_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "ark"."roles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."memberships" ADD CONSTRAINT "memberships_ark_user_id_users_id_fk" FOREIGN KEY ("ark_user_id") REFERENCES "ark"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."memberships" ADD CONSTRAINT "memberships_role_id_roles_id_fk" FOREIGN KEY ("role_id") REFERENCES "ark"."roles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."message_pins" ADD CONSTRAINT "message_pins_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "ark"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."message_pins" ADD CONSTRAINT "message_pins_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "ark"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."message_pins" ADD CONSTRAINT "message_pins_pinned_by_ark_user_id_users_id_fk" FOREIGN KEY ("pinned_by_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."message_reactions" ADD CONSTRAINT "message_reactions_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "ark"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."message_reactions" ADD CONSTRAINT "message_reactions_ark_user_id_users_id_fk" FOREIGN KEY ("ark_user_id") REFERENCES "ark"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."message_relations" ADD CONSTRAINT "message_relations_message_id_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "ark"."messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."messages" ADD CONSTRAINT "messages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."messages" ADD CONSTRAINT "messages_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "ark"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."messages" ADD CONSTRAINT "messages_root_message_id_messages_id_fk" FOREIGN KEY ("root_message_id") REFERENCES "ark"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."messages" ADD CONSTRAINT "messages_author_ark_user_id_users_id_fk" FOREIGN KEY ("author_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."pages" ADD CONSTRAINT "pages_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."pages" ADD CONSTRAINT "pages_parent_page_id_pages_id_fk" FOREIGN KEY ("parent_page_id") REFERENCES "ark"."pages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."spaces" ADD CONSTRAINT "spaces_parent_space_id_spaces_id_fk" FOREIGN KEY ("parent_space_id") REFERENCES "ark"."spaces"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."spaces" ADD CONSTRAINT "spaces_owner_ark_user_id_users_id_fk" FOREIGN KEY ("owner_ark_user_id") REFERENCES "ark"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."user_channel_states" ADD CONSTRAINT "user_channel_states_ark_user_id_users_id_fk" FOREIGN KEY ("ark_user_id") REFERENCES "ark"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."user_channel_states" ADD CONSTRAINT "user_channel_states_channel_id_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "ark"."channels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."user_channel_states" ADD CONSTRAINT "user_channel_states_last_seen_message_id_messages_id_fk" FOREIGN KEY ("last_seen_message_id") REFERENCES "ark"."messages"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."user_settings" ADD CONSTRAINT "user_settings_ark_user_id_users_id_fk" FOREIGN KEY ("ark_user_id") REFERENCES "ark"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."views" ADD CONSTRAINT "views_space_id_spaces_id_fk" FOREIGN KEY ("space_id") REFERENCES "ark"."spaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ark"."views" ADD CONSTRAINT "views_collection_id_collections_id_fk" FOREIGN KEY ("collection_id") REFERENCES "ark"."collections"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "ark_auth_accounts_provider_account_idx" ON "ark"."auth_accounts" USING btree ("provider_id","account_id");--> statement-breakpoint
CREATE INDEX "ark_auth_accounts_user_id_idx" ON "ark"."auth_accounts" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_settings_key_unique" ON "ark"."settings" USING btree ("key");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_users_auth_user_unique" ON "ark"."users" USING btree ("auth_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_users_handle_unique" ON "ark"."users" USING btree ("handle");--> statement-breakpoint
CREATE INDEX "ark_users_avatar_file_idx" ON "ark"."users" USING btree ("avatar_file_id");--> statement-breakpoint
CREATE INDEX "ark_users_kind_idx" ON "ark"."users" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ark_auth_sessions_user_id_idx" ON "ark"."auth_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_channel_categories_space_slug_unique" ON "ark"."channel_categories" USING btree ("space_id","slug") WHERE "ark"."channel_categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_channel_categories_space_id_idx" ON "ark"."channel_categories" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "ark_channel_categories_space_position_idx" ON "ark"."channel_categories" USING btree ("space_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_channel_members_channel_user_unique" ON "ark"."channel_members" USING btree ("channel_id","ark_user_id");--> statement-breakpoint
CREATE INDEX "ark_channel_members_user_idx" ON "ark"."channel_members" USING btree ("ark_user_id");--> statement-breakpoint
CREATE INDEX "ark_channel_members_channel_idx" ON "ark"."channel_members" USING btree ("channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_channels_identity_key_unique" ON "ark"."channels" USING btree ("identity_key") WHERE "ark"."channels"."identity_key" is not null and "ark"."channels"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ark_channels_space_slug_unique" ON "ark"."channels" USING btree ("space_id","slug") WHERE "ark"."channels"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_channels_space_id_idx" ON "ark"."channels" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "ark_channels_category_id_idx" ON "ark"."channels" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "ark_channels_kind_idx" ON "ark"."channels" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ark_channels_thread_parent_idx" ON "ark"."channels" USING btree ("thread_parent_channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_channels_thread_root_unique" ON "ark"."channels" USING btree ("thread_root_message_id") WHERE "ark"."channels"."kind" = 'thread' and "ark"."channels"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ark_collections_space_slug_unique" ON "ark"."collections" USING btree ("space_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_fields_collection_key_unique" ON "ark"."fields" USING btree ("collection_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_fields_collection_slot_unique" ON "ark"."fields" USING btree ("collection_id","slot_kind","slot_index") WHERE "ark"."fields"."slot_kind" is not null and "ark"."fields"."slot_index" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "ark_file_variants_file_kind_unique" ON "ark"."file_variants" USING btree ("file_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_file_variants_path_unique" ON "ark"."file_variants" USING btree ("path");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_files_path_unique" ON "ark"."files" USING btree ("path");--> statement-breakpoint
CREATE INDEX "ark_files_owner_idx" ON "ark"."files" USING btree ("owner_ark_user_id");--> statement-breakpoint
CREATE INDEX "ark_grants_subject_idx" ON "ark"."grants" USING btree ("subject_type","subject_id");--> statement-breakpoint
CREATE INDEX "ark_grants_scope_action_idx" ON "ark"."grants" USING btree ("scope_type","scope_id","action");--> statement-breakpoint
CREATE INDEX "ark_grants_active_subject_action_idx" ON "ark"."grants" USING btree ("subject_type","subject_id","action","effect") WHERE "ark"."grants"."status" = 'active' and "ark"."grants"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_collection_id_idx" ON "ark"."items" USING btree ("collection_id");--> statement-breakpoint
CREATE INDEX "ark_items_parent_position_idx" ON "ark"."items" USING btree ("parent_item_id","position") WHERE "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_root_position_idx" ON "ark"."items" USING btree ("root_item_id","position") WHERE "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_space_id_idx" ON "ark"."items" USING btree ("space_id");--> statement-breakpoint
CREATE INDEX "ark_items_text_001_idx" ON "ark"."items" USING btree ("collection_id","text_001") WHERE "ark"."items"."text_001" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_002_idx" ON "ark"."items" USING btree ("collection_id","text_002") WHERE "ark"."items"."text_002" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_003_idx" ON "ark"."items" USING btree ("collection_id","text_003") WHERE "ark"."items"."text_003" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_004_idx" ON "ark"."items" USING btree ("collection_id","text_004") WHERE "ark"."items"."text_004" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_005_idx" ON "ark"."items" USING btree ("collection_id","text_005") WHERE "ark"."items"."text_005" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_006_idx" ON "ark"."items" USING btree ("collection_id","text_006") WHERE "ark"."items"."text_006" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_007_idx" ON "ark"."items" USING btree ("collection_id","text_007") WHERE "ark"."items"."text_007" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_008_idx" ON "ark"."items" USING btree ("collection_id","text_008") WHERE "ark"."items"."text_008" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_009_idx" ON "ark"."items" USING btree ("collection_id","text_009") WHERE "ark"."items"."text_009" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_010_idx" ON "ark"."items" USING btree ("collection_id","text_010") WHERE "ark"."items"."text_010" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_011_idx" ON "ark"."items" USING btree ("collection_id","text_011") WHERE "ark"."items"."text_011" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_012_idx" ON "ark"."items" USING btree ("collection_id","text_012") WHERE "ark"."items"."text_012" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_013_idx" ON "ark"."items" USING btree ("collection_id","text_013") WHERE "ark"."items"."text_013" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_014_idx" ON "ark"."items" USING btree ("collection_id","text_014") WHERE "ark"."items"."text_014" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_015_idx" ON "ark"."items" USING btree ("collection_id","text_015") WHERE "ark"."items"."text_015" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_016_idx" ON "ark"."items" USING btree ("collection_id","text_016") WHERE "ark"."items"."text_016" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_017_idx" ON "ark"."items" USING btree ("collection_id","text_017") WHERE "ark"."items"."text_017" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_018_idx" ON "ark"."items" USING btree ("collection_id","text_018") WHERE "ark"."items"."text_018" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_019_idx" ON "ark"."items" USING btree ("collection_id","text_019") WHERE "ark"."items"."text_019" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_020_idx" ON "ark"."items" USING btree ("collection_id","text_020") WHERE "ark"."items"."text_020" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_021_idx" ON "ark"."items" USING btree ("collection_id","text_021") WHERE "ark"."items"."text_021" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_022_idx" ON "ark"."items" USING btree ("collection_id","text_022") WHERE "ark"."items"."text_022" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_023_idx" ON "ark"."items" USING btree ("collection_id","text_023") WHERE "ark"."items"."text_023" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_024_idx" ON "ark"."items" USING btree ("collection_id","text_024") WHERE "ark"."items"."text_024" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_025_idx" ON "ark"."items" USING btree ("collection_id","text_025") WHERE "ark"."items"."text_025" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_026_idx" ON "ark"."items" USING btree ("collection_id","text_026") WHERE "ark"."items"."text_026" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_027_idx" ON "ark"."items" USING btree ("collection_id","text_027") WHERE "ark"."items"."text_027" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_028_idx" ON "ark"."items" USING btree ("collection_id","text_028") WHERE "ark"."items"."text_028" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_029_idx" ON "ark"."items" USING btree ("collection_id","text_029") WHERE "ark"."items"."text_029" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_030_idx" ON "ark"."items" USING btree ("collection_id","text_030") WHERE "ark"."items"."text_030" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_031_idx" ON "ark"."items" USING btree ("collection_id","text_031") WHERE "ark"."items"."text_031" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_032_idx" ON "ark"."items" USING btree ("collection_id","text_032") WHERE "ark"."items"."text_032" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_033_idx" ON "ark"."items" USING btree ("collection_id","text_033") WHERE "ark"."items"."text_033" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_034_idx" ON "ark"."items" USING btree ("collection_id","text_034") WHERE "ark"."items"."text_034" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_035_idx" ON "ark"."items" USING btree ("collection_id","text_035") WHERE "ark"."items"."text_035" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_036_idx" ON "ark"."items" USING btree ("collection_id","text_036") WHERE "ark"."items"."text_036" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_037_idx" ON "ark"."items" USING btree ("collection_id","text_037") WHERE "ark"."items"."text_037" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_038_idx" ON "ark"."items" USING btree ("collection_id","text_038") WHERE "ark"."items"."text_038" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_039_idx" ON "ark"."items" USING btree ("collection_id","text_039") WHERE "ark"."items"."text_039" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_040_idx" ON "ark"."items" USING btree ("collection_id","text_040") WHERE "ark"."items"."text_040" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_041_idx" ON "ark"."items" USING btree ("collection_id","text_041") WHERE "ark"."items"."text_041" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_042_idx" ON "ark"."items" USING btree ("collection_id","text_042") WHERE "ark"."items"."text_042" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_043_idx" ON "ark"."items" USING btree ("collection_id","text_043") WHERE "ark"."items"."text_043" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_044_idx" ON "ark"."items" USING btree ("collection_id","text_044") WHERE "ark"."items"."text_044" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_045_idx" ON "ark"."items" USING btree ("collection_id","text_045") WHERE "ark"."items"."text_045" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_046_idx" ON "ark"."items" USING btree ("collection_id","text_046") WHERE "ark"."items"."text_046" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_047_idx" ON "ark"."items" USING btree ("collection_id","text_047") WHERE "ark"."items"."text_047" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_048_idx" ON "ark"."items" USING btree ("collection_id","text_048") WHERE "ark"."items"."text_048" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_049_idx" ON "ark"."items" USING btree ("collection_id","text_049") WHERE "ark"."items"."text_049" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_050_idx" ON "ark"."items" USING btree ("collection_id","text_050") WHERE "ark"."items"."text_050" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_051_idx" ON "ark"."items" USING btree ("collection_id","text_051") WHERE "ark"."items"."text_051" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_052_idx" ON "ark"."items" USING btree ("collection_id","text_052") WHERE "ark"."items"."text_052" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_053_idx" ON "ark"."items" USING btree ("collection_id","text_053") WHERE "ark"."items"."text_053" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_054_idx" ON "ark"."items" USING btree ("collection_id","text_054") WHERE "ark"."items"."text_054" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_055_idx" ON "ark"."items" USING btree ("collection_id","text_055") WHERE "ark"."items"."text_055" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_056_idx" ON "ark"."items" USING btree ("collection_id","text_056") WHERE "ark"."items"."text_056" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_057_idx" ON "ark"."items" USING btree ("collection_id","text_057") WHERE "ark"."items"."text_057" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_058_idx" ON "ark"."items" USING btree ("collection_id","text_058") WHERE "ark"."items"."text_058" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_059_idx" ON "ark"."items" USING btree ("collection_id","text_059") WHERE "ark"."items"."text_059" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_060_idx" ON "ark"."items" USING btree ("collection_id","text_060") WHERE "ark"."items"."text_060" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_061_idx" ON "ark"."items" USING btree ("collection_id","text_061") WHERE "ark"."items"."text_061" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_062_idx" ON "ark"."items" USING btree ("collection_id","text_062") WHERE "ark"."items"."text_062" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_063_idx" ON "ark"."items" USING btree ("collection_id","text_063") WHERE "ark"."items"."text_063" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_064_idx" ON "ark"."items" USING btree ("collection_id","text_064") WHERE "ark"."items"."text_064" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_065_idx" ON "ark"."items" USING btree ("collection_id","text_065") WHERE "ark"."items"."text_065" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_066_idx" ON "ark"."items" USING btree ("collection_id","text_066") WHERE "ark"."items"."text_066" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_067_idx" ON "ark"."items" USING btree ("collection_id","text_067") WHERE "ark"."items"."text_067" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_068_idx" ON "ark"."items" USING btree ("collection_id","text_068") WHERE "ark"."items"."text_068" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_069_idx" ON "ark"."items" USING btree ("collection_id","text_069") WHERE "ark"."items"."text_069" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_070_idx" ON "ark"."items" USING btree ("collection_id","text_070") WHERE "ark"."items"."text_070" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_071_idx" ON "ark"."items" USING btree ("collection_id","text_071") WHERE "ark"."items"."text_071" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_072_idx" ON "ark"."items" USING btree ("collection_id","text_072") WHERE "ark"."items"."text_072" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_073_idx" ON "ark"."items" USING btree ("collection_id","text_073") WHERE "ark"."items"."text_073" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_074_idx" ON "ark"."items" USING btree ("collection_id","text_074") WHERE "ark"."items"."text_074" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_075_idx" ON "ark"."items" USING btree ("collection_id","text_075") WHERE "ark"."items"."text_075" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_076_idx" ON "ark"."items" USING btree ("collection_id","text_076") WHERE "ark"."items"."text_076" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_077_idx" ON "ark"."items" USING btree ("collection_id","text_077") WHERE "ark"."items"."text_077" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_078_idx" ON "ark"."items" USING btree ("collection_id","text_078") WHERE "ark"."items"."text_078" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_079_idx" ON "ark"."items" USING btree ("collection_id","text_079") WHERE "ark"."items"."text_079" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_080_idx" ON "ark"."items" USING btree ("collection_id","text_080") WHERE "ark"."items"."text_080" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_081_idx" ON "ark"."items" USING btree ("collection_id","text_081") WHERE "ark"."items"."text_081" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_082_idx" ON "ark"."items" USING btree ("collection_id","text_082") WHERE "ark"."items"."text_082" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_083_idx" ON "ark"."items" USING btree ("collection_id","text_083") WHERE "ark"."items"."text_083" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_084_idx" ON "ark"."items" USING btree ("collection_id","text_084") WHERE "ark"."items"."text_084" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_085_idx" ON "ark"."items" USING btree ("collection_id","text_085") WHERE "ark"."items"."text_085" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_086_idx" ON "ark"."items" USING btree ("collection_id","text_086") WHERE "ark"."items"."text_086" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_087_idx" ON "ark"."items" USING btree ("collection_id","text_087") WHERE "ark"."items"."text_087" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_088_idx" ON "ark"."items" USING btree ("collection_id","text_088") WHERE "ark"."items"."text_088" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_089_idx" ON "ark"."items" USING btree ("collection_id","text_089") WHERE "ark"."items"."text_089" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_090_idx" ON "ark"."items" USING btree ("collection_id","text_090") WHERE "ark"."items"."text_090" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_091_idx" ON "ark"."items" USING btree ("collection_id","text_091") WHERE "ark"."items"."text_091" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_092_idx" ON "ark"."items" USING btree ("collection_id","text_092") WHERE "ark"."items"."text_092" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_093_idx" ON "ark"."items" USING btree ("collection_id","text_093") WHERE "ark"."items"."text_093" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_094_idx" ON "ark"."items" USING btree ("collection_id","text_094") WHERE "ark"."items"."text_094" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_095_idx" ON "ark"."items" USING btree ("collection_id","text_095") WHERE "ark"."items"."text_095" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_text_096_idx" ON "ark"."items" USING btree ("collection_id","text_096") WHERE "ark"."items"."text_096" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_001_idx" ON "ark"."items" USING btree ("collection_id","number_001") WHERE "ark"."items"."number_001" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_002_idx" ON "ark"."items" USING btree ("collection_id","number_002") WHERE "ark"."items"."number_002" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_003_idx" ON "ark"."items" USING btree ("collection_id","number_003") WHERE "ark"."items"."number_003" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_004_idx" ON "ark"."items" USING btree ("collection_id","number_004") WHERE "ark"."items"."number_004" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_005_idx" ON "ark"."items" USING btree ("collection_id","number_005") WHERE "ark"."items"."number_005" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_006_idx" ON "ark"."items" USING btree ("collection_id","number_006") WHERE "ark"."items"."number_006" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_007_idx" ON "ark"."items" USING btree ("collection_id","number_007") WHERE "ark"."items"."number_007" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_008_idx" ON "ark"."items" USING btree ("collection_id","number_008") WHERE "ark"."items"."number_008" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_009_idx" ON "ark"."items" USING btree ("collection_id","number_009") WHERE "ark"."items"."number_009" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_010_idx" ON "ark"."items" USING btree ("collection_id","number_010") WHERE "ark"."items"."number_010" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_011_idx" ON "ark"."items" USING btree ("collection_id","number_011") WHERE "ark"."items"."number_011" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_012_idx" ON "ark"."items" USING btree ("collection_id","number_012") WHERE "ark"."items"."number_012" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_013_idx" ON "ark"."items" USING btree ("collection_id","number_013") WHERE "ark"."items"."number_013" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_014_idx" ON "ark"."items" USING btree ("collection_id","number_014") WHERE "ark"."items"."number_014" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_015_idx" ON "ark"."items" USING btree ("collection_id","number_015") WHERE "ark"."items"."number_015" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_016_idx" ON "ark"."items" USING btree ("collection_id","number_016") WHERE "ark"."items"."number_016" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_017_idx" ON "ark"."items" USING btree ("collection_id","number_017") WHERE "ark"."items"."number_017" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_018_idx" ON "ark"."items" USING btree ("collection_id","number_018") WHERE "ark"."items"."number_018" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_019_idx" ON "ark"."items" USING btree ("collection_id","number_019") WHERE "ark"."items"."number_019" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_020_idx" ON "ark"."items" USING btree ("collection_id","number_020") WHERE "ark"."items"."number_020" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_021_idx" ON "ark"."items" USING btree ("collection_id","number_021") WHERE "ark"."items"."number_021" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_022_idx" ON "ark"."items" USING btree ("collection_id","number_022") WHERE "ark"."items"."number_022" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_023_idx" ON "ark"."items" USING btree ("collection_id","number_023") WHERE "ark"."items"."number_023" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_024_idx" ON "ark"."items" USING btree ("collection_id","number_024") WHERE "ark"."items"."number_024" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_025_idx" ON "ark"."items" USING btree ("collection_id","number_025") WHERE "ark"."items"."number_025" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_026_idx" ON "ark"."items" USING btree ("collection_id","number_026") WHERE "ark"."items"."number_026" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_027_idx" ON "ark"."items" USING btree ("collection_id","number_027") WHERE "ark"."items"."number_027" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_028_idx" ON "ark"."items" USING btree ("collection_id","number_028") WHERE "ark"."items"."number_028" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_029_idx" ON "ark"."items" USING btree ("collection_id","number_029") WHERE "ark"."items"."number_029" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_030_idx" ON "ark"."items" USING btree ("collection_id","number_030") WHERE "ark"."items"."number_030" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_031_idx" ON "ark"."items" USING btree ("collection_id","number_031") WHERE "ark"."items"."number_031" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_number_032_idx" ON "ark"."items" USING btree ("collection_id","number_032") WHERE "ark"."items"."number_032" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_001_idx" ON "ark"."items" USING btree ("collection_id","date_001") WHERE "ark"."items"."date_001" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_002_idx" ON "ark"."items" USING btree ("collection_id","date_002") WHERE "ark"."items"."date_002" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_003_idx" ON "ark"."items" USING btree ("collection_id","date_003") WHERE "ark"."items"."date_003" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_004_idx" ON "ark"."items" USING btree ("collection_id","date_004") WHERE "ark"."items"."date_004" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_005_idx" ON "ark"."items" USING btree ("collection_id","date_005") WHERE "ark"."items"."date_005" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_006_idx" ON "ark"."items" USING btree ("collection_id","date_006") WHERE "ark"."items"."date_006" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_007_idx" ON "ark"."items" USING btree ("collection_id","date_007") WHERE "ark"."items"."date_007" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_008_idx" ON "ark"."items" USING btree ("collection_id","date_008") WHERE "ark"."items"."date_008" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_009_idx" ON "ark"."items" USING btree ("collection_id","date_009") WHERE "ark"."items"."date_009" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_010_idx" ON "ark"."items" USING btree ("collection_id","date_010") WHERE "ark"."items"."date_010" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_011_idx" ON "ark"."items" USING btree ("collection_id","date_011") WHERE "ark"."items"."date_011" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_012_idx" ON "ark"."items" USING btree ("collection_id","date_012") WHERE "ark"."items"."date_012" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_013_idx" ON "ark"."items" USING btree ("collection_id","date_013") WHERE "ark"."items"."date_013" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_014_idx" ON "ark"."items" USING btree ("collection_id","date_014") WHERE "ark"."items"."date_014" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_015_idx" ON "ark"."items" USING btree ("collection_id","date_015") WHERE "ark"."items"."date_015" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_016_idx" ON "ark"."items" USING btree ("collection_id","date_016") WHERE "ark"."items"."date_016" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_017_idx" ON "ark"."items" USING btree ("collection_id","date_017") WHERE "ark"."items"."date_017" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_018_idx" ON "ark"."items" USING btree ("collection_id","date_018") WHERE "ark"."items"."date_018" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_019_idx" ON "ark"."items" USING btree ("collection_id","date_019") WHERE "ark"."items"."date_019" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_020_idx" ON "ark"."items" USING btree ("collection_id","date_020") WHERE "ark"."items"."date_020" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_021_idx" ON "ark"."items" USING btree ("collection_id","date_021") WHERE "ark"."items"."date_021" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_022_idx" ON "ark"."items" USING btree ("collection_id","date_022") WHERE "ark"."items"."date_022" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_023_idx" ON "ark"."items" USING btree ("collection_id","date_023") WHERE "ark"."items"."date_023" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_024_idx" ON "ark"."items" USING btree ("collection_id","date_024") WHERE "ark"."items"."date_024" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_025_idx" ON "ark"."items" USING btree ("collection_id","date_025") WHERE "ark"."items"."date_025" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_026_idx" ON "ark"."items" USING btree ("collection_id","date_026") WHERE "ark"."items"."date_026" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_027_idx" ON "ark"."items" USING btree ("collection_id","date_027") WHERE "ark"."items"."date_027" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_028_idx" ON "ark"."items" USING btree ("collection_id","date_028") WHERE "ark"."items"."date_028" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_029_idx" ON "ark"."items" USING btree ("collection_id","date_029") WHERE "ark"."items"."date_029" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_030_idx" ON "ark"."items" USING btree ("collection_id","date_030") WHERE "ark"."items"."date_030" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_031_idx" ON "ark"."items" USING btree ("collection_id","date_031") WHERE "ark"."items"."date_031" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_date_032_idx" ON "ark"."items" USING btree ("collection_id","date_032") WHERE "ark"."items"."date_032" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_001_idx" ON "ark"."items" USING btree ("collection_id","boolean_001") WHERE "ark"."items"."boolean_001" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_002_idx" ON "ark"."items" USING btree ("collection_id","boolean_002") WHERE "ark"."items"."boolean_002" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_003_idx" ON "ark"."items" USING btree ("collection_id","boolean_003") WHERE "ark"."items"."boolean_003" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_004_idx" ON "ark"."items" USING btree ("collection_id","boolean_004") WHERE "ark"."items"."boolean_004" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_005_idx" ON "ark"."items" USING btree ("collection_id","boolean_005") WHERE "ark"."items"."boolean_005" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_006_idx" ON "ark"."items" USING btree ("collection_id","boolean_006") WHERE "ark"."items"."boolean_006" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_007_idx" ON "ark"."items" USING btree ("collection_id","boolean_007") WHERE "ark"."items"."boolean_007" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_008_idx" ON "ark"."items" USING btree ("collection_id","boolean_008") WHERE "ark"."items"."boolean_008" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_009_idx" ON "ark"."items" USING btree ("collection_id","boolean_009") WHERE "ark"."items"."boolean_009" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_010_idx" ON "ark"."items" USING btree ("collection_id","boolean_010") WHERE "ark"."items"."boolean_010" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_011_idx" ON "ark"."items" USING btree ("collection_id","boolean_011") WHERE "ark"."items"."boolean_011" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_012_idx" ON "ark"."items" USING btree ("collection_id","boolean_012") WHERE "ark"."items"."boolean_012" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_013_idx" ON "ark"."items" USING btree ("collection_id","boolean_013") WHERE "ark"."items"."boolean_013" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_014_idx" ON "ark"."items" USING btree ("collection_id","boolean_014") WHERE "ark"."items"."boolean_014" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_015_idx" ON "ark"."items" USING btree ("collection_id","boolean_015") WHERE "ark"."items"."boolean_015" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_016_idx" ON "ark"."items" USING btree ("collection_id","boolean_016") WHERE "ark"."items"."boolean_016" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_017_idx" ON "ark"."items" USING btree ("collection_id","boolean_017") WHERE "ark"."items"."boolean_017" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_018_idx" ON "ark"."items" USING btree ("collection_id","boolean_018") WHERE "ark"."items"."boolean_018" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_019_idx" ON "ark"."items" USING btree ("collection_id","boolean_019") WHERE "ark"."items"."boolean_019" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_020_idx" ON "ark"."items" USING btree ("collection_id","boolean_020") WHERE "ark"."items"."boolean_020" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_021_idx" ON "ark"."items" USING btree ("collection_id","boolean_021") WHERE "ark"."items"."boolean_021" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_022_idx" ON "ark"."items" USING btree ("collection_id","boolean_022") WHERE "ark"."items"."boolean_022" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_023_idx" ON "ark"."items" USING btree ("collection_id","boolean_023") WHERE "ark"."items"."boolean_023" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_024_idx" ON "ark"."items" USING btree ("collection_id","boolean_024") WHERE "ark"."items"."boolean_024" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_025_idx" ON "ark"."items" USING btree ("collection_id","boolean_025") WHERE "ark"."items"."boolean_025" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_026_idx" ON "ark"."items" USING btree ("collection_id","boolean_026") WHERE "ark"."items"."boolean_026" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_027_idx" ON "ark"."items" USING btree ("collection_id","boolean_027") WHERE "ark"."items"."boolean_027" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_028_idx" ON "ark"."items" USING btree ("collection_id","boolean_028") WHERE "ark"."items"."boolean_028" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_029_idx" ON "ark"."items" USING btree ("collection_id","boolean_029") WHERE "ark"."items"."boolean_029" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_030_idx" ON "ark"."items" USING btree ("collection_id","boolean_030") WHERE "ark"."items"."boolean_030" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_031_idx" ON "ark"."items" USING btree ("collection_id","boolean_031") WHERE "ark"."items"."boolean_031" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_boolean_032_idx" ON "ark"."items" USING btree ("collection_id","boolean_032") WHERE "ark"."items"."boolean_032" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_001_idx" ON "ark"."items" USING btree ("collection_id","select_001") WHERE "ark"."items"."select_001" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_002_idx" ON "ark"."items" USING btree ("collection_id","select_002") WHERE "ark"."items"."select_002" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_003_idx" ON "ark"."items" USING btree ("collection_id","select_003") WHERE "ark"."items"."select_003" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_004_idx" ON "ark"."items" USING btree ("collection_id","select_004") WHERE "ark"."items"."select_004" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_005_idx" ON "ark"."items" USING btree ("collection_id","select_005") WHERE "ark"."items"."select_005" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_006_idx" ON "ark"."items" USING btree ("collection_id","select_006") WHERE "ark"."items"."select_006" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_007_idx" ON "ark"."items" USING btree ("collection_id","select_007") WHERE "ark"."items"."select_007" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_008_idx" ON "ark"."items" USING btree ("collection_id","select_008") WHERE "ark"."items"."select_008" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_009_idx" ON "ark"."items" USING btree ("collection_id","select_009") WHERE "ark"."items"."select_009" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_010_idx" ON "ark"."items" USING btree ("collection_id","select_010") WHERE "ark"."items"."select_010" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_011_idx" ON "ark"."items" USING btree ("collection_id","select_011") WHERE "ark"."items"."select_011" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_012_idx" ON "ark"."items" USING btree ("collection_id","select_012") WHERE "ark"."items"."select_012" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_013_idx" ON "ark"."items" USING btree ("collection_id","select_013") WHERE "ark"."items"."select_013" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_014_idx" ON "ark"."items" USING btree ("collection_id","select_014") WHERE "ark"."items"."select_014" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_015_idx" ON "ark"."items" USING btree ("collection_id","select_015") WHERE "ark"."items"."select_015" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_016_idx" ON "ark"."items" USING btree ("collection_id","select_016") WHERE "ark"."items"."select_016" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_017_idx" ON "ark"."items" USING btree ("collection_id","select_017") WHERE "ark"."items"."select_017" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_018_idx" ON "ark"."items" USING btree ("collection_id","select_018") WHERE "ark"."items"."select_018" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_019_idx" ON "ark"."items" USING btree ("collection_id","select_019") WHERE "ark"."items"."select_019" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_020_idx" ON "ark"."items" USING btree ("collection_id","select_020") WHERE "ark"."items"."select_020" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_021_idx" ON "ark"."items" USING btree ("collection_id","select_021") WHERE "ark"."items"."select_021" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_022_idx" ON "ark"."items" USING btree ("collection_id","select_022") WHERE "ark"."items"."select_022" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_023_idx" ON "ark"."items" USING btree ("collection_id","select_023") WHERE "ark"."items"."select_023" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_024_idx" ON "ark"."items" USING btree ("collection_id","select_024") WHERE "ark"."items"."select_024" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_025_idx" ON "ark"."items" USING btree ("collection_id","select_025") WHERE "ark"."items"."select_025" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_026_idx" ON "ark"."items" USING btree ("collection_id","select_026") WHERE "ark"."items"."select_026" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_027_idx" ON "ark"."items" USING btree ("collection_id","select_027") WHERE "ark"."items"."select_027" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_028_idx" ON "ark"."items" USING btree ("collection_id","select_028") WHERE "ark"."items"."select_028" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_029_idx" ON "ark"."items" USING btree ("collection_id","select_029") WHERE "ark"."items"."select_029" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_030_idx" ON "ark"."items" USING btree ("collection_id","select_030") WHERE "ark"."items"."select_030" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_031_idx" ON "ark"."items" USING btree ("collection_id","select_031") WHERE "ark"."items"."select_031" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_items_select_032_idx" ON "ark"."items" USING btree ("collection_id","select_032") WHERE "ark"."items"."select_032" is not null and "ark"."items"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ark_market_categories_slug_unique" ON "ark"."market_categories" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "market_job_categories_job_target_unique" ON "ark"."market_job_categories" USING btree ("job_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_job_skills_job_target_unique" ON "ark"."market_job_skills" USING btree ("job_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_job_styles_job_target_unique" ON "ark"."market_job_styles" USING btree ("job_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_job_tags_job_target_unique" ON "ark"."market_job_tags" USING btree ("job_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_job_tools_job_target_unique" ON "ark"."market_job_tools" USING btree ("job_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_market_jobs_source_external_active_unique" ON "ark"."market_jobs" USING btree ("source","external_id") WHERE "ark"."market_jobs"."source" is not null and "ark"."market_jobs"."external_id" is not null and "ark"."market_jobs"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_market_jobs_status_idx" ON "ark"."market_jobs" USING btree ("status");--> statement-breakpoint
CREATE INDEX "ark_market_jobs_curation_status_idx" ON "ark"."market_jobs" USING btree ("curation_status");--> statement-breakpoint
CREATE INDEX "ark_market_jobs_source_published_at_idx" ON "ark"."market_jobs" USING btree ("source_published_at");--> statement-breakpoint
CREATE INDEX "ark_market_jobs_published_at_idx" ON "ark"."market_jobs" USING btree ("published_at");--> statement-breakpoint
CREATE INDEX "ark_market_jobs_rating_idx" ON "ark"."market_jobs" USING btree ("rating");--> statement-breakpoint
CREATE INDEX "ark_market_jobs_curation_published_idx" ON "ark"."market_jobs" USING btree ("curation_status","published_at");--> statement-breakpoint
CREATE INDEX "ark_market_jobs_discussion_channel_idx" ON "ark"."market_jobs" USING btree ("discussion_channel_id");--> statement-breakpoint
CREATE INDEX "ark_market_jobs_primary_category_idx" ON "ark"."market_jobs" USING btree ("primary_category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_market_skills_slug_unique" ON "ark"."market_skills" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "market_store_categories_store_target_unique" ON "ark"."market_store_categories" USING btree ("store_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_store_skills_store_target_unique" ON "ark"."market_store_skills" USING btree ("store_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_store_styles_store_target_unique" ON "ark"."market_store_styles" USING btree ("store_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_store_tags_store_target_unique" ON "ark"."market_store_tags" USING btree ("store_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "market_store_tools_store_target_unique" ON "ark"."market_store_tools" USING btree ("store_id","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_market_stores_owner_space_unique" ON "ark"."market_stores" USING btree ("owner_space_id") WHERE "ark"."market_stores"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_market_stores_status_idx" ON "ark"."market_stores" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_market_styles_slug_unique" ON "ark"."market_styles" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_market_tags_slug_unique" ON "ark"."market_tags" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_market_tools_slug_unique" ON "ark"."market_tools" USING btree ("slug");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_membership_roles_membership_role_unique" ON "ark"."membership_roles" USING btree ("membership_id","role_id");--> statement-breakpoint
CREATE INDEX "ark_membership_roles_membership_idx" ON "ark"."membership_roles" USING btree ("membership_id");--> statement-breakpoint
CREATE INDEX "ark_membership_roles_role_idx" ON "ark"."membership_roles" USING btree ("role_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_memberships_scope_user_unique" ON "ark"."memberships" USING btree ("scope_type","scope_id","ark_user_id");--> statement-breakpoint
CREATE INDEX "ark_memberships_ark_user_id_idx" ON "ark"."memberships" USING btree ("ark_user_id");--> statement-breakpoint
CREATE INDEX "ark_memberships_scope_idx" ON "ark"."memberships" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_message_pins_message_unique" ON "ark"."message_pins" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ark_message_pins_channel_idx" ON "ark"."message_pins" USING btree ("channel_id");--> statement-breakpoint
CREATE INDEX "ark_message_pins_channel_order_idx" ON "ark"."message_pins" USING btree ("channel_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "ark"."message_pins"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ark_message_reactions_unique" ON "ark"."message_reactions" USING btree ("message_id","ark_user_id","emoji");--> statement-breakpoint
CREATE INDEX "ark_message_relations_message_idx" ON "ark"."message_relations" USING btree ("message_id");--> statement-breakpoint
CREATE INDEX "ark_message_relations_target_idx" ON "ark"."message_relations" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "ark_message_relations_message_target_idx" ON "ark"."message_relations" USING btree ("message_id","target_type","target_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_message_relations_one_reply_quote" ON "ark"."message_relations" USING btree ("message_id") WHERE "ark"."message_relations"."relation_type" = 'reply_quote' and "ark"."message_relations"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "ark_message_relations_one_forum_parent" ON "ark"."message_relations" USING btree ("message_id") WHERE "ark"."message_relations"."relation_type" = 'forum_parent' and "ark"."message_relations"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_messages_channel_created_idx" ON "ark"."messages" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "ark_messages_channel_order_idx" ON "ark"."messages" USING btree ("channel_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST) WHERE "ark"."messages"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_notifications_target_idx" ON "ark"."notifications" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX "ark_notifications_status_idx" ON "ark"."notifications" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_pages_space_slug_unique" ON "ark"."pages" USING btree ("space_id","slug");--> statement-breakpoint
CREATE INDEX "ark_pages_parent_position_idx" ON "ark"."pages" USING btree ("parent_page_id","position");--> statement-breakpoint
CREATE INDEX "ark_roles_scope_idx" ON "ark"."roles" USING btree ("scope_type","scope_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_roles_scope_key_unique" ON "ark"."roles" USING btree ("scope_type","scope_id","key");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_spaces_parent_slug_unique" ON "ark"."spaces" USING btree ("parent_space_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_spaces_root_slug_unique" ON "ark"."spaces" USING btree ("slug") WHERE "ark"."spaces"."parent_space_id" is null and "ark"."spaces"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "ark_spaces_parent_space_id_idx" ON "ark"."spaces" USING btree ("parent_space_id");--> statement-breakpoint
CREATE INDEX "ark_spaces_kind_idx" ON "ark"."spaces" USING btree ("kind");--> statement-breakpoint
CREATE INDEX "ark_spaces_visibility_idx" ON "ark"."spaces" USING btree ("visibility");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_user_channel_states_user_channel_unique" ON "ark"."user_channel_states" USING btree ("ark_user_id","channel_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_user_settings_user_unique" ON "ark"."user_settings" USING btree ("ark_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_views_collection_slug_unique" ON "ark"."views" USING btree ("collection_id","slug");--> statement-breakpoint
CREATE INDEX "ark_views_space_id_idx" ON "ark"."views" USING btree ("space_id");
