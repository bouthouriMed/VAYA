import type { TimestampedEntity } from '../shared/base.types.js';

export interface Route extends TimestampedEntity {
  originLabel: string;
  originLat: number;
  originLng: number;
  originAreaRadiusM: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  destinationAreaRadiusM: number;
  distanceKm: number;
  estimatedDurationMin: number;
  minContribution: number;
  recommendedContribution: number;
  maxContribution: number;
}
