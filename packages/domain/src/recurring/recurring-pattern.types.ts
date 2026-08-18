import type { TimestampedEntity, UUID } from '../shared/base.types.js';

export const RECURRING_PATTERN_ROLES = ['rider', 'driver'] as const;
export type RecurringPatternRole = (typeof RECURRING_PATTERN_ROLES)[number];

export const RECURRING_PATTERN_STATUSES = [
  'detected',
  'suggested',
  'enabled',
  'dismissed',
] as const;
export type RecurringPatternStatus = (typeof RECURRING_PATTERN_STATUSES)[number];

export interface RecurringPattern extends TimestampedEntity {
  userId: UUID;
  role: RecurringPatternRole;
  routeId: UUID | null;
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  /** Bitmask, Monday = bit 0 ... Sunday = bit 6 */
  daysOfWeekMask: number;
  timeWindowStart: string;
  timeWindowEnd: string;
  confidenceScore: number;
  status: RecurringPatternStatus;
  lastMatchedAt: Date | null;
}
