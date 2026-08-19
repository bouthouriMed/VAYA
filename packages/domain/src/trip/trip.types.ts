import type { TimestampedEntity, UUID } from '../shared/base.types';
import type { TripStatus } from './trip-status';

export interface Trip extends TimestampedEntity {
  bookingId: UUID;
  rideId: UUID;
  status: TripStatus;
  simulationStartedAt: Date | null;
  pickupConfirmedAt: Date | null;
  dropoffAt: Date | null;
  riderSettlementConfirmedAt: Date | null;
  driverSettlementConfirmedAt: Date | null;
}
