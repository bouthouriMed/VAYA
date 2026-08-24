ALTER TABLE "conversations" ADD COLUMN "driver_last_read_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "conversations" ADD COLUMN "rider_last_read_at" timestamp with time zone;