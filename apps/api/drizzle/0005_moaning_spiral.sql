CREATE TABLE IF NOT EXISTS "pricing_configs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scope" varchar(30) DEFAULT 'national' NOT NULL,
	"scope_ref_id" uuid,
	"base_rate_per_km" double precision NOT NULL,
	"time_component_per_min" double precision NOT NULL,
	"min_multiplier" double precision NOT NULL,
	"max_multiplier" double precision NOT NULL,
	"platform_fee_rate" double precision DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
