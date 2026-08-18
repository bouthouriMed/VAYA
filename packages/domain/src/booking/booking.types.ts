import type { TimestampedEntity, UUID } from '../shared/base.types';
import type { BookingStatus } from './booking-status';

export interface Booking extends TimestampedEntity {
  rideId: UUID;
  riderId: UUID;
  seatsRequested: number;
  contributionTotal: number;
  status: BookingStatus;
  pickupLabel: string;
  pickupLat: number;
  pickupLng: number;
  requestedAt: Date;
  respondedAt: Date | null;
}
