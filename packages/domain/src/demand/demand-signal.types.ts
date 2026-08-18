import type { TimestampedEntity, UUID } from '../shared/base.types.js';

export const DEMAND_SIGNAL_STATUSES = ['open', 'notified', 'expired'] as const;
export type DemandSignalStatus = (typeof DEMAND_SIGNAL_STATUSES)[number];

export interface DemandSignal extends TimestampedEntity {
  userId: UUID;
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  desiredWindowStart: Date;
  desiredWindowEnd: Date;
  status: DemandSignalStatus;
}
