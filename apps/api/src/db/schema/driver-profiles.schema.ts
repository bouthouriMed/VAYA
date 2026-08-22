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

export const verificationStatusEnum = pgEnum('verification_status', [
  'pending',
  'approved',
  'rejected',
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
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
