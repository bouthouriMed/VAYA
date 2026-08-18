import type { TimestampedEntity, UUID } from '../shared/base.types.js';
import type { BookingStatus } from './booking-status.js';

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
