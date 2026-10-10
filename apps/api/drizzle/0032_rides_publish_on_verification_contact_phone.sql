ALTER TABLE "users" ADD COLUMN "contact_phone" varchar(20);--> statement-breakpoint
ALTER TABLE "rides" ADD COLUMN "publish_on_verification_at" timestamp with time zone;