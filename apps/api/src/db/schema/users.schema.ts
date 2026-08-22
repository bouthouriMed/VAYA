import { pgEnum, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const localeEnum = pgEnum('locale', ['fr', 'ar', 'en']);
export const authProviderEnum = pgEnum('auth_provider', ['phone', 'google']);

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  // Nullable: a Google-created account has no phone until the user adds one.
  // Still unique when present (Postgres allows multiple NULLs under a unique
  // constraint), so phone/OTP lookups and the OTP flow itself are unchanged.
  phone: varchar('phone', { length: 20 }).unique(),
  email: varchar('email', { length: 255 }).unique(),
  googleId: varchar('google_id', { length: 255 }).unique(),
  authProvider: authProviderEnum('auth_provider').notNull().default('phone'),
  fullName: varchar('full_name', { length: 80 }).notNull(),
  avatarUrl: varchar('avatar_url', { length: 500 }),
  locale: localeEnum('locale').notNull().default('fr'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const otpCodes = pgTable('otp_codes', {
  id: uuid('id').primaryKey().defaultRandom(),
  phone: varchar('phone', { length: 20 }).notNull(),
  code: varchar('code', { length: 6 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// Single-use handoff between the browser-mediated Google OAuth callback
// (which can only respond via an HTTP redirect, not a JSON response) and the
// app's normal token-issuance path: the callback mints a short-lived ticket
// and deep-links the app to it; the app immediately exchanges the ticket for
// real session tokens via POST /auth/google/exchange. Mirrors otpCodes'
// consumedAt/expiresAt shape.
export const oauthLoginTickets = pgTable('oauth_login_tickets', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  ticketHash: varchar('ticket_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  consumedAt: timestamp('consumed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const refreshTokens = pgTable('refresh_tokens', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
