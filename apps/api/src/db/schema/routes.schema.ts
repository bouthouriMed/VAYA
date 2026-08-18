import { doublePrecision, integer, pgTable, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';

export const routes = pgTable('routes', {
  id: uuid('id').primaryKey().defaultRandom(),
  originLabel: varchar('origin_label', { length: 140 }).notNull(),
  originLat: doublePrecision('origin_lat').notNull(),
  originLng: doublePrecision('origin_lng').notNull(),
  originAreaRadiusM: integer('origin_area_radius_m').notNull().default(1500),
  destinationLabel: varchar('destination_label', { length: 140 }).notNull(),
  destinationLat: doublePrecision('destination_lat').notNull(),
  destinationLng: doublePrecision('destination_lng').notNull(),
  destinationAreaRadiusM: integer('destination_area_radius_m').notNull().default(1500),
  distanceKm: doublePrecision('distance_km').notNull(),
  estimatedDurationMin: integer('estimated_duration_min').notNull(),
  minContribution: doublePrecision('min_contribution').notNull(),
  recommendedContribution: doublePrecision('recommended_contribution').notNull(),
  maxContribution: doublePrecision('max_contribution').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
