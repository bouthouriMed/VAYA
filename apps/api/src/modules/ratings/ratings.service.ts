import { and, eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { driverProfiles, ratings, relationshipSignals, trips } from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { CreateRatingInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

async function upsertRelationshipSignal(db: Database, userAId: string, userBId: string, at: Date) {
  const [first, second] = [userAId, userBId].sort();
  if (!first || !second) return;

  const existing = await db.query.relationshipSignals.findFirst({
    where: and(eq(relationshipSignals.userAId, first), eq(relationshipSignals.userBId, second)),
  });

  if (existing) {
    await db
      .update(relationshipSignals)
      .set({
        tripsTogetherCount: existing.tripsTogetherCount + 1,
        lastTripAt: at,
        updatedAt: new Date(),
      })
      .where(eq(relationshipSignals.id, existing.id));
  } else {
    await db.insert(relationshipSignals).values({
      userAId: first,
      userBId: second,
      tripsTogetherCount: 1,
      lastTripAt: at,
    });
  }
}

async function recomputeDriverAggregates(db: Database, driverUserId: string) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, driverUserId),
  });
  if (!profile) return;

  const receivedRatings = await db.query.ratings.findMany({
    where: and(eq(ratings.rateeUserId, driverUserId), eq(ratings.role, 'rider_rates_driver')),
  });
  if (receivedRatings.length === 0) return;

  const ratingAvg = receivedRatings.reduce((sum, r) => sum + r.stars, 0) / receivedRatings.length;
  const punctualCount = receivedRatings.filter((r) => r.punctualityFlag).length;
  const punctualityScore = punctualCount / receivedRatings.length;

  await db
    .update(driverProfiles)
    .set({ ratingAvg, punctualityScore, reliabilityScore: punctualityScore, updatedAt: new Date() })
    .where(eq(driverProfiles.id, profile.id));
}

export async function createRating(db: Database, raterUserId: string, input: CreateRatingInput) {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, input.tripId),
    with: { booking: { with: { ride: { with: { driverProfile: true } } } } },
  });
  if (!trip) throw new NotFoundError('Trip');
  if (trip.status !== 'completed') {
    throw new ConflictError('Ratings can only be left after the trip is completed');
  }

  const riderId = trip.booking.riderId;
  const driverUserId = trip.booking.ride.driverProfile.userId;

  let rateeUserId: string;
  if (input.role === 'rider_rates_driver') {
    if (raterUserId !== riderId) throw new ForbiddenError('Only the rider can leave this rating');
    rateeUserId = driverUserId;
  } else {
    if (raterUserId !== driverUserId)
      throw new ForbiddenError('Only the driver can leave this rating');
    rateeUserId = riderId;
  }

  const existing = await db.query.ratings.findFirst({
    where: and(eq(ratings.tripId, input.tripId), eq(ratings.raterUserId, raterUserId)),
  });
  if (existing) throw new ConflictError('You have already rated this trip');

  const isFirstRatingForTrip =
    (await db.query.ratings.findMany({ where: eq(ratings.tripId, input.tripId) })).length === 0;

  const [rating] = await db
    .insert(ratings)
    .values({
      tripId: input.tripId,
      raterUserId,
      rateeUserId,
      role: input.role,
      stars: input.stars,
      punctualityFlag: input.punctualityFlag ?? null,
      comment: input.comment ?? null,
    })
    .returning();
  if (!rating) throw new Error('Failed to create rating');

  if (isFirstRatingForTrip) {
    await upsertRelationshipSignal(db, riderId, driverUserId, new Date());
  }

  const rateeIsDriver = rateeUserId === driverUserId;
  if (rateeIsDriver) {
    await recomputeDriverAggregates(db, driverUserId);
  }

  return rating;
}

export async function getRatingsSummary(db: Database, userId: string) {
  const received = await db.query.ratings.findMany({ where: eq(ratings.rateeUserId, userId) });
  const count = received.length;
  const average = count === 0 ? 0 : received.reduce((sum, r) => sum + r.stars, 0) / count;
  return { count, average };
}
