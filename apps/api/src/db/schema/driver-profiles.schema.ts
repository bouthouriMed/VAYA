import {
  doublePrecision,
  integer,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

// Admin verification workflow (docs/domain/verification-workflow.md):
// 'under_review' and 'resubmission_required' are additive values appended
// to the existing enum (ALTER TYPE ... ADD VALUE) — 'pending'/'approved'/
// 'rejected' keep their exact prior meaning for every existing row.
export const verificationStatusEnum = pgEnum('verification_status', [
  'pending',
  'under_review',
  'approved',
  'rejected',
  'resubmission_required',
]);

export const verificationDeclineReasonEnum = pgEnum('verification_decline_reason', [
  'document_unclear',
  'expired',
  'information_mismatch',
  'missing_document',
  'invalid_document',
  'additional_info_required',
  'other',
]);

export const driverProfiles = pgTable('driver_profiles', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .unique()
    .references(() => users.id, { onDelete: 'cascade' }),
  verificationStatus: verificationStatusEnum('verification_status').notNull().default('pending'),
  bio: text('bio'),
  // Comma-separated (e.g. "Français,Arabe,Anglais") — a simple free-text
  // list rather than a normalized languages table, matching this schema's
  // existing low-complexity conventions (see CLAUDE.md: no premature
  // abstraction). Nullable: most existing driver rows predate this column.
  languages: varchar('languages', { length: 200 }),
  ratingAvg: doublePrecision('rating_avg').notNull().default(0),
  tripCount: integer('trip_count').notNull().default(0),
  punctualityScore: doublePrecision('punctuality_score').notNull().default(0),
  reliabilityScore: doublePrecision('reliability_score').notNull().default(0),
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): a raw,
  // monotonically-increasing count of weighted cancellation/no-show
  // penalty points (packages/domain/src/booking/cancellation-policy.ts),
  // distinct from `reliabilityScore` above (which is rating-derived —
  // ratings.service.ts's recomputeDriverAggregates — and would otherwise
  // be silently overwritten by the next rating submission if this reused
  // that column). Deliberately a raw count, not a normalized 0-1 score:
  // honest about being a first-cut signal, not a fabricated precision
  // metric. See docs/domain/cancellation-policy.md.
  reliabilityPenaltyPoints: integer('reliability_penalty_points').notNull().default(0),
  approvedAt: timestamp('approved_at', { withTimezone: true }),
  // Admin verification workflow — all nullable/additive, unset for every
  // driver approved before this feature existed (they stay 'approved' and
  // simply have no review metadata, which is correct: they were never
  // reviewed by an admin).
  verificationSubmittedAt: timestamp('verification_submitted_at', { withTimezone: true }),
  verificationReviewedByAdminId: uuid('verification_reviewed_by_admin_id'),
  verificationReviewedAt: timestamp('verification_reviewed_at', { withTimezone: true }),
  verificationDeclineReason: verificationDeclineReasonEnum('verification_decline_reason'),
  // User-facing explanation of what to fix — shown verbatim on the
  // resubmission screen. Never the same field as adminNotes below.
  verificationDeclineMessage: text('verification_decline_message'),
  // Internal-only admin notes — never returned by any user-facing endpoint.
  verificationAdminNotes: text('verification_admin_notes'),
  // Increments on every resubmission; the review-history record itself
  // lives in audit_logs (VERIFICATION_* actions), not a duplicate table.
  verificationAttempt: integer('verification_attempt').notNull().default(1),
  // Suspension of driving privileges independent of verification status —
  // an admin action (docs/roadmap: "restrict driver privileges"), not a
  // verification outcome.
  suspendedAt: timestamp('suspended_at', { withTimezone: true }),
  suspendedReason: text('suspended_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
