CREATE TABLE IF NOT EXISTS "recurring_detection_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(30) DEFAULT 'global' NOT NULL,
	"min_trip_count" integer NOT NULL,
	"full_confidence_trip_count" integer NOT NULL,
	"lookback_days" integer NOT NULL,
	"corridor_radius_meters" double precision NOT NULL,
	"time_window_minutes" double precision NOT NULL,
	"suggested_confidence_threshold" double precision NOT NULL,
	"dismissal_required_confidence_delta" double precision NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
