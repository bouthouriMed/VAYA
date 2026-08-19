ALTER TYPE "notification_event_type" ADD VALUE 'booking_cancelled';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'booking_no_show_reported';--> statement-breakpoint
ALTER TABLE "driver_profiles" ADD COLUMN "reliability_penalty_points" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "rider_profiles" ADD COLUMN "reliability_penalty_points" integer DEFAULT 0 NOT NULL;