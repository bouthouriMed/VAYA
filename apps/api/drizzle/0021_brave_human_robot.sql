ALTER TYPE "booking_status" ADD VALUE 'superseded';--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "expires_at" timestamp with time zone;