import type { TimestampedEntity, UUID } from '../shared/base.types';

export interface Vehicle extends TimestampedEntity {
  driverProfileId: UUID;
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  seatCount: number;
  photoUrl: string | null;
}
