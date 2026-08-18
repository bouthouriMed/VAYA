import type { TimestampedEntity, UUID } from '../shared/base.types.js';

/** Factual co-travel history between two users. Never implies a personal relationship. */
export interface RelationshipSignal extends TimestampedEntity {
  userAId: UUID;
  userBId: UUID;
  tripsTogetherCount: number;
  lastTripAt: Date;
}
