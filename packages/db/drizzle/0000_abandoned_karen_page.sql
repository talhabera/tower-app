CREATE TABLE "audit_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"actor_email" text NOT NULL,
	"action" text NOT NULL,
	"target" text,
	"payload" jsonb NOT NULL,
	"status" text NOT NULL,
	"error_kind" text,
	"result" jsonb,
	"parent_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "backup_preset" (
	"id" integer PRIMARY KEY NOT NULL,
	"frequency" text DEFAULT '0 3 * * *' NOT NULL,
	"keep_local" integer DEFAULT 7 NOT NULL,
	"keep_s3" integer DEFAULT 30 NOT NULL,
	"s3_storage_uuid" text,
	"updated_by" text,
	"updated_at" timestamp with time zone
);
--> statement-breakpoint
CREATE INDEX "audit_log_created_at_idx" ON "audit_log" USING btree ("created_at");