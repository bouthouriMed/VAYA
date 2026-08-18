import { integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { driverProfiles } from './driver-profiles.schema';

export const vehicles = pgTable('vehicles', {
  id: uuid('id').primaryKey().defaultRandom(),
  driverProfileId: uuid('driver_profile_id')
    .notNull()
    .references(() => driverProfiles.id, { onDelete: 'cascade' }),
  make: varchar('make', { length: 40 }).notNull(),
  model: varchar('model', { length: 40 }).notNull(),
  color: varchar('color', { length: 30 }).notNull(),
  plateNumber: varchar('plate_number', { length: 20 }).notNull(),
  seatCount: integer('seat_count').notNull(),
  photoUrl: varchar('photo_url', { length: 500 }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
