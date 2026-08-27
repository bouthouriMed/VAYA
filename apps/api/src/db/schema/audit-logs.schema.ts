import { index, jsonb, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { adminUsers } from './admin-users.schema';

// Every important admin mutation writes one row here (CLAUDE.md's live
// tracking/admin brief: "No important admin action should happen
// invisibly"). Free-text `action`/`targetType` rather than pgEnums — this
// table's whole point is to be an append-only record of *whatever* admin
// actions exist today or get added later, without a migration each time.
// Also doubles as verification review history (docs/domain/
// verification-workflow.md) instead of a second dedicated history table.
export const auditLogs = pgTable(
  'audit_logs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    adminUserId: uuid('admin_user_id')
      .notNull()
      .references(() => adminUsers.id, { onDelete: 'cascade' }),
    action: varchar('action', { length: 64 }).notNull(),
    targetType: varchar('target_type', { length: 32 }).notNull(),
    targetId: uuid('target_id').notNull(),
    reason: text('reason'),
    previousState: jsonb('previous_state'),
    newState: jsonb('new_state'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    targetIdx: index('audit_logs_target_idx').on(table.targetType, table.targetId),
    createdAtIdx: index('audit_logs_created_at_idx').on(table.createdAt),
  }),
);
