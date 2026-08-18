import type { TimestampedEntity, UUID } from '../shared/base.types.js';

export const RATING_ROLES = ['rider_rates_driver', 'driver_rates_rider'] as const;
export type RatingRole = (typeof RATING_ROLES)[number];

export interface Rating extends TimestampedEntity {
  tripId: UUID;
  raterUserId: UUID;
  rateeUserId: UUID;
  role: RatingRole;
  stars: number;
  punctualityFlag: boolean | null;
  comment: string | null;
}
