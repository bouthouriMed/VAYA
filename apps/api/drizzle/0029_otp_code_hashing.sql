-- Security sprint 2026-09-21 (docs/security/security-audit.md VAYA-SEC-002):
-- one-time codes are stored as an HMAC, never plaintext, and every code
-- carries a wrong-guess counter.
--
-- otp_codes is an ephemeral table (codes live 5 minutes and are single-use),
-- so any still-pending row is simply discarded: a user mid-login just taps
-- "resend". This also guarantees no plaintext code survives the migration.
DELETE FROM "otp_codes";--> statement-breakpoint
ALTER TABLE "otp_codes" DROP COLUMN "code";--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "code_hash" varchar(64) NOT NULL;--> statement-breakpoint
ALTER TABLE "otp_codes" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "otp_codes_phone_created_idx" ON "otp_codes" USING btree ("phone","created_at");
