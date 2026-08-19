CREATE INDEX IF NOT EXISTS "bookings_ride_id_idx" ON "bookings" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "bookings_rider_id_idx" ON "bookings" USING btree ("rider_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "demand_signals_status_idx" ON "demand_signals" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rides_status_departure_at_idx" ON "rides" USING btree ("status","departure_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rides_driver_profile_id_idx" ON "rides" USING btree ("driver_profile_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rides_vehicle_id_idx" ON "rides" USING btree ("vehicle_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rides_route_id_idx" ON "rides" USING btree ("route_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "trips_ride_id_idx" ON "trips" USING btree ("ride_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ratings_trip_id_idx" ON "ratings" USING btree ("trip_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ratings_ratee_user_id_idx" ON "ratings" USING btree ("ratee_user_id");