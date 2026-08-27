import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

// A separate credential table rather than a `role` column on `users`:
// admin/ops staff are not marketplace participants (no phone/OTP identity,
// no rider/driver profile), and email+password is the standard internal-tool
// login pattern — reusing the phone/OTP flow would force every ops hire to
// have a Tunisian phone number tied into the marketplace. Own JWT payload
// shape ({ sub, type: 'admin' }), verified by a dedicated `authenticateAdmin`
// hook (app.ts) — never mixed with the consumer `authenticate` hook.
export const adminRoleEnum = pgEnum('admin_role', ['admin', 'superadmin']);

export const adminUsers = pgTable('admin_users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 80 }).notNull(),
  role: adminRoleEnum('role').notNull().default('admin'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
