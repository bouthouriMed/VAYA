import { index, pgEnum, pgTable, timestamp, uuid } from 'drizzle-orm/pg-core';
import { bookings } from './bookings.schema';
import { rides } from './rides.schema';

export const tripStatusEnum = pgEnum('trip_status', [
  'scheduled',
  'driver_approaching',
  'pickup',
  'active',
  'arriving',
  'completed',
  'no_show',
  'cancelled',
]);

export const trips = pgTable(
  'trips',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    bookingId: uuid('booking_id')
      .notNull()
      .unique()
      .references(() => bookings.id, { onDelete: 'cascade' }),
    rideId: uuid('ride_id')
      .notNull()
      .references(() => rides.id, { onDelete: 'cascade' }),
    status: tripStatusEnum('status').notNull().default('scheduled'),
    simulationStartedAt: timestamp('simulation_started_at', { withTimezone: true }),
    pickupConfirmedAt: timestamp('pickup_confirmed_at', { withTimezone: true }),
    dropoffAt: timestamp('dropoff_at', { withTimezone: true }),
    riderSettlementConfirmedAt: timestamp('rider_settlement_confirmed_at', { withTimezone: true }),
    driverSettlementConfirmedAt: timestamp('driver_settlement_confirmed_at', {
      withTimezone: true,
    }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({ rideIdIdx: index('trips_ride_id_idx').on(table.rideId) }),
);
