DO $$ BEGIN
 CREATE TYPE "public"."admin_role" AS ENUM('admin', 'superadmin');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."verification_decline_reason" AS ENUM('document_unclear', 'expired', 'information_mismatch', 'missing_document', 'invalid_document', 'additional_info_required', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."report_category" AS ENUM('unsafe_driving', 'harassment', 'no_show', 'payment_dispute', 'vehicle_condition', 'other');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 CREATE TYPE "public"."report_status" AS ENUM('open', 'investigating', 'resolved', 'dismissed');
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TYPE "verification_status" ADD VALUE 'under_review';--> statement-breakpoint
ALTER TYPE "verification_status" ADD VALUE 'resubmission_required';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'trip_arriving';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'trip_tracking_unavailable';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'verification_submitted';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'verification_approved';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'verification_declined';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'verification_resubmission_required';--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "admin_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"password_hash" varchar(255) NOT NULL,
	"full_name" varchar(80) NOT NULL,
	"role" "admin_role" DEFAULT 'admin' NOT NULL,
	"last_login_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "admin_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "analytics_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_name" varchar(64) NOT NULL,
	"user_id" uuid,
	"search_id" uuid,
	"origin_label" varchar(140),
	"origin_lat" double precision,
	"origin_lng" double precision,
	"destination_label" varchar(140),
	"destination_lat" double precision,
	"destination_lng" double precision,
	"corridor_key" varchar(300),
	"desired_departure_at" timestamp with time zone,
	"seats" integer,
	"result_count" integer,
	"match_tier" varchar(32),
	"selected_ride_id" uuid,
	"duration_ms" integer,
	"metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "audit_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"admin_user_id" uuid NOT NULL,
	"action" varchar(64) NOT NULL,
	"target_type" varchar(32) NOT NULL,
	"target_id" uuid NOT NULL,
	"reason" text,
	"previous_state" jsonb,
	"new_state" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"reporter_user_id" uuid NOT NULL,
	"reported_user_id" uuid,
	"booking_id" uuid,
	"trip_id" uuid,
	"category" "report_category" NOT NULL,
	"description" text NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolved_by_admin_id" uuid,
	"resolved_at" timestamp with time zone,
	"resolution_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "verification_submitted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "verification_reviewed_by_admin_id" uuid;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "verification_reviewed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "verification_decline_reason" "verification_decline_reason";--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "verification_decline_message" text;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "verification_admin_notes" text;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "verification_attempt" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "suspended_reason" text;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "current_lat" double precision;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "current_lng" double precision;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "current_heading_deg" double precision;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "current_speed_mps" double precision;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "current_accuracy_m" double precision;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "location_updated_at" timestamp with time zone;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "analytics_events" ADD CONSTRAINT "analytics_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_admin_user_id_admin_users_id_fk" FOREIGN KEY ("admin_user_id") REFERENCES "public"."admin_users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_reporter_user_id_users_id_fk" FOREIGN KEY ("reporter_user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_reported_user_id_users_id_fk" FOREIGN KEY ("reported_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_trip_id_trips_id_fk" FOREIGN KEY ("trip_id") REFERENCES "public"."trips"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reports" ADD CONSTRAINT "reports_resolved_by_admin_id_admin_users_id_fk" FOREIGN KEY ("resolved_by_admin_id") REFERENCES "public"."admin_users"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_name_created_at_idx" ON "analytics_events" USING btree ("event_name","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_corridor_created_at_idx" ON "analytics_events" USING btree ("corridor_key","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "analytics_events_search_id_idx" ON "analytics_events" USING btree ("search_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_target_idx" ON "audit_logs" USING btree ("target_type","target_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audit_logs_created_at_idx" ON "audit_logs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "reports_reported_user_id_idx" ON "reports" USING btree ("reported_user_id");