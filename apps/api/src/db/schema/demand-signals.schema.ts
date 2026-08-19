import {
  doublePrecision,
  index,
  pgEnum,
  pgTable,
  timestamp,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const demandSignalStatusEnum = pgEnum('demand_signal_status', [
  'open',
  'notified',
  'expired',
]);

export const demandSignals = pgTable(
  'demand_signals',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    originLabel: varchar('origin_label', { length: 140 }).notNull(),
    originLat: doublePrecision('origin_lat').notNull(),
    originLng: doublePrecision('origin_lng').notNull(),
    destinationLabel: varchar('destination_label', { length: 140 }).notNull(),
    destinationLat: doublePrecision('destination_lat').notNull(),
    destinationLng: doublePrecision('destination_lng').notNull(),
    desiredWindowStart: timestamp('desired_window_start', { withTimezone: true }).notNull(),
    desiredWindowEnd: timestamp('desired_window_end', { withTimezone: true }).notNull(),
    status: demandSignalStatusEnum('status').notNull().default('open'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ statusIdx: index('demand_signals_status_idx').on(table.status) }),
);
