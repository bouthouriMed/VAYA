import { integer, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

/** Factual co-travel history between two users. Never implies a personal relationship. */
export const relationshipSignals = pgTable('relationship_signals', {
  id: uuid('id').primaryKey().defaultRandom(),
  userAId: uuid('user_a_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  userBId: uuid('user_b_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tripsTogetherCount: integer('trips_together_count').notNull().default(0),
  lastTripAt: timestamp('last_trip_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
