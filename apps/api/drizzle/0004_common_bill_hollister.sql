ALTER TABLE "bookings" ADD COLUMN "pickup_stop_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bookings" ADD CONSTRAINT "bookings_pickup_stop_id_route_stops_id_fk" FOREIGN KEY ("pickup_stop_id") REFERENCES "public"."route_stops"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_pickup_stop_id_idx" ON "bookings" USING btree ("pickup_stop_id");