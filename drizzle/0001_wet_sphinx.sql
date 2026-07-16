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
CREATE UNIQUE INDEX "ark_resource_definitions_name_unique" ON "ark"."resource_definitions" USING btree ("name");--> statement-breakpoint
CREATE UNIQUE INDEX "ark_resource_definitions_table_unique" ON "ark"."resource_definitions" USING btree ("schema_name","table_name");