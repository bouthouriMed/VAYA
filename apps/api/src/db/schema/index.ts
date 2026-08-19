import { relations } from 'drizzle-orm';
import { users, refreshTokens } from './users.schema';
import { driverProfiles } from './driver-profiles.schema';
import { vehicles } from './vehicles.schema';
import { verificationDocuments } from './verification-documents.schema';
import { routes } from './routes.schema';
import { rides } from './rides.schema';
import { routeStops } from './route-stops.schema';
import { bookings } from './bookings.schema';
import { trips } from './trips.schema';
import { ratings } from './ratings.schema';
import { recurringPatterns } from './recurring-patterns.schema';
import { relationshipSignals } from './relationship-signals.schema';
import { demandSignals } from './demand-signals.schema';
import { notifications } from './notifications.schema';

export * from './users.schema';
export * from './driver-profiles.schema';
export * from './vehicles.schema';
export * from './verification-documents.schema';
export * from './routes.schema';
export * from './rides.schema';
export * from './route-stops.schema';
export * from './bookings.schema';
export * from './trips.schema';
export * from './ratings.schema';
export * from './recurring-patterns.schema';
export * from './relationship-signals.schema';
export * from './demand-signals.schema';
export * from './notifications.schema';

export const usersRelations = relations(users, ({ one, many }) => ({
  driverProfile: one(driverProfiles, {
    fields: [users.id],
    references: [driverProfiles.userId],
  }),
  bookings: many(bookings),
  refreshTokens: many(refreshTokens),
}));

export const driverProfilesRelations = relations(driverProfiles, ({ one, many }) => ({
  user: one(users, { fields: [driverProfiles.userId], references: [users.id] }),
  vehicles: many(vehicles),
  documents: many(verificationDocuments),
  rides: many(rides),
}));

export const vehiclesRelations = relations(vehicles, ({ one, many }) => ({
  driverProfile: one(driverProfiles, {
    fields: [vehicles.driverProfileId],
    references: [driverProfiles.id],
  }),
  rides: many(rides),
}));

export const verificationDocumentsRelations = relations(verificationDocuments, ({ one }) => ({
  driverProfile: one(driverProfiles, {
    fields: [verificationDocuments.driverProfileId],
    references: [driverProfiles.id],
  }),
}));

export const routesRelations = relations(routes, ({ many }) => ({
  rides: many(rides),
  recurringPatterns: many(recurringPatterns),
}));

export const ridesRelations = relations(rides, ({ one, many }) => ({
  driverProfile: one(driverProfiles, {
    fields: [rides.driverProfileId],
    references: [driverProfiles.id],
  }),
  vehicle: one(vehicles, { fields: [rides.vehicleId], references: [vehicles.id] }),
  route: one(routes, { fields: [rides.routeId], references: [routes.id] }),
  recurringPattern: one(recurringPatterns, {
    fields: [rides.recurringPatternId],
    references: [recurringPatterns.id],
  }),
  bookings: many(bookings),
  stops: many(routeStops),
}));

export const routeStopsRelations = relations(routeStops, ({ one }) => ({
  ride: one(rides, { fields: [routeStops.rideId], references: [rides.id] }),
}));

export const bookingsRelations = relations(bookings, ({ one }) => ({
  ride: one(rides, { fields: [bookings.rideId], references: [rides.id] }),
  rider: one(users, { fields: [bookings.riderId], references: [users.id] }),
  trip: one(trips, { fields: [bookings.id], references: [trips.bookingId] }),
}));

export const tripsRelations = relations(trips, ({ one, many }) => ({
  booking: one(bookings, { fields: [trips.bookingId], references: [bookings.id] }),
  ride: one(rides, { fields: [trips.rideId], references: [rides.id] }),
  ratings: many(ratings),
}));

export const ratingsRelations = relations(ratings, ({ one }) => ({
  trip: one(trips, { fields: [ratings.tripId], references: [trips.id] }),
  rater: one(users, { fields: [ratings.raterUserId], references: [users.id] }),
  ratee: one(users, { fields: [ratings.rateeUserId], references: [users.id] }),
}));

export const recurringPatternsRelations = relations(recurringPatterns, ({ one }) => ({
  user: one(users, { fields: [recurringPatterns.userId], references: [users.id] }),
  route: one(routes, { fields: [recurringPatterns.routeId], references: [routes.id] }),
}));

export const relationshipSignalsRelations = relations(relationshipSignals, ({ one }) => ({
  userA: one(users, { fields: [relationshipSignals.userAId], references: [users.id] }),
  userB: one(users, { fields: [relationshipSignals.userBId], references: [users.id] }),
}));

export const demandSignalsRelations = relations(demandSignals, ({ one }) => ({
  user: one(users, { fields: [demandSignals.userId], references: [users.id] }),
}));

export const notificationsRelations = relations(notifications, ({ one }) => ({
  user: one(users, { fields: [notifications.userId], references: [users.id] }),
}));
