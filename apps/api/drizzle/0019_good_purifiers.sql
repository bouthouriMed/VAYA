ALTER TYPE "notification_event_type" ADD VALUE 'trip_completion_reminder';--> statement-breakpoint
ALTER TABLE "trips" ADD COLUMN "completion_reminder_sent_at" timestamp with time zone;