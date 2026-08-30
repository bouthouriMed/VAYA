ALTER TYPE "notification_event_type" ADD VALUE 'booking_deadline_approaching';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'booking_sibling_cancelled';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'trip_active';--> statement-breakpoint
ALTER TYPE "notification_event_type" ADD VALUE 'trip_eta_changed';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "deadline_reminder_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "last_notified_eta_sec" integer;