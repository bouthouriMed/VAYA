ALTER TYPE "notification_event_type" ADD VALUE 'trip_passenger_onboard';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'trip_route_deviation';--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "route_deviation_status" varchar(20);--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "live_corridor_waypoints" jsonb;