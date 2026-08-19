import type { TimestampedEntity, UUID } from '../shared/base.types';
import type { RideStatus } from './ride-status';

export interface Ride extends TimestampedEntity {
  driverProfileId: UUID;
  vehicleId: UUID;
  routeId: UUID | null;
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  departureAt: Date;
  seatsTotal: number;
  seatsAvailable: number;
  contributionPerSeat: number;
  status: RideStatus;
  routePolyline: string | null;
  estimatedDurationSec: number | null;
  recurringPatternId: UUID | null;
}
