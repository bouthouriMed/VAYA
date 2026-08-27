import { index, pgEnum, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { adminUsers } from './admin-users.schema';
import { bookings } from './bookings.schema';
import { trips } from './trips.schema';
import { users } from './users.schema';

export const reportCategoryEnum = pgEnum('report_category', [
  'unsafe_driving',
  'harassment',
  'no_show',
  'payment_dispute',
  'vehicle_condition',
  'other',
]);

export const reportStatusEnum = pgEnum('report_status', [
  'open',
  'investigating',
  'resolved',
  'dismissed',
]);

// Safety/moderation reports — greenfield (the audit found zero reporting
// mechanism anywhere in this codebase; Open Decision #6 in CLAUDE.md flags
// messaging moderation as explicitly deferred). Scoped to what the admin
// "Reports / Safety" surface needs: who reported, about whom/what, why, and
// its resolution — not a full trust-and-safety case-management system.
export const reports = pgTable(
  'reports',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    reporterUserId: uuid('reporter_user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    reportedUserId: uuid('reported_user_id').references(() => users.id, { onDelete: 'set null' }),
    bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'set null' }),
    tripId: uuid('trip_id').references(() => trips.id, { onDelete: 'set null' }),
    category: reportCategoryEnum('category').notNull(),
    description: text('description').notNull(),
    status: reportStatusEnum('status').notNull().default('open'),
    resolvedByAdminId: uuid('resolved_by_admin_id').references(() => adminUsers.id),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    resolutionNotes: text('resolution_notes'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    statusIdx: index('reports_status_idx').on(table.status),
    reportedUserIdIdx: index('reports_reported_user_id_idx').on(table.reportedUserId),
  }),
);
