import { index, pgEnum, pgTable, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from './users.schema';

export const devicePlatformEnum = pgEnum('device_platform', ['ios', 'android']);

/**
 * A device's Expo push token, one row per (user, physical device). A
 * dedicated table rather than a column on `users` — per
 * docs/roadmap/phase-07-notifications.md — because a user can have several
 * devices, and re-registering the same token (reinstall, token refresh)
 * should update in place rather than accumulate duplicates (`token` is
 * unique across all users: a token always identifies exactly one current
 * device/installation, so a re-registration under a different account
 * reassigns it rather than leaving a stale row pointing at the old owner).
 */
export const deviceTokens = pgTable(
  'device_tokens',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: varchar('token', { length: 255 }).notNull(),
    platform: devicePlatformEnum('platform').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    tokenIdx: uniqueIndex('device_tokens_token_idx').on(table.token),
    userIdIdx: index('device_tokens_user_id_idx').on(table.userId),
  }),
);
