import { and, eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { driverProfiles, ratings, relationshipSignals, riderProfiles, trips } from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import type { CreateRatingInput } from '@vaya/validation';
import {
  computeRatingAggregate,
  computeTrustTier,
  isWithinRatingWindow,
  type TrustTier,
} from '@vaya/domain';
import { getUserById } from '../users/users.service.js';

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

/**
 * "Recompute from all ratings," not increment/decrement (the phase doc's
 * explicit business rule — docs/roadmap/phase-09-ratings-trust.md) — the
 * actual math lives in packages/domain/src/rating/rating-aggregate.ts
 * (pure, no I/O); this is just the DB read/write around it. Correct even if
 * a rating is ever retroactively changed or removed by a future moderation
 * action (out of scope for this phase).
 */
async function recomputeDriverAggregates(db: Database, driverUserId: string) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, driverUserId),
  });
  if (!profile) return;

  const receivedRatings = await db.query.ratings.findMany({
    where: and(eq(ratings.rateeUserId, driverUserId), eq(ratings.role, 'rider_rates_driver')),
  });

  const { ratingAvg, punctualityScore } = computeRatingAggregate(receivedRatings);

  await db
    .update(driverProfiles)
    .set({ ratingAvg, punctualityScore, reliabilityScore: punctualityScore, updatedAt: new Date() })
    .where(eq(driverProfiles.id, profile.id));
}

/**
 * Rider-side mirror of recomputeDriverAggregates, writing to
 * `rider_profiles` (this phase's rider-reputation storage decision — see
 * apps/api/src/db/schema/rider-profiles.schema.ts's doc comment and
 * docs/domain/model.md). Upserts the row on a rider's first-ever received
 * rating, same lazy-creation pattern trips.service.ts's refreshTripCounts
 * uses.
 */
async function recomputeRiderAggregates(db: Database, riderId: string) {
  const receivedRatings = await db.query.ratings.findMany({
    where: and(eq(ratings.rateeUserId, riderId), eq(ratings.role, 'driver_rates_rider')),
  });

  const { ratingAvg, punctualityScore } = computeRatingAggregate(receivedRatings);

  const existing = await db.query.riderProfiles.findFirst({
    where: eq(riderProfiles.userId, riderId),
  });
  if (existing) {
    await db
      .update(riderProfiles)
      .set({ ratingAvg, punctualityScore, updatedAt: new Date() })
      .where(eq(riderProfiles.id, existing.id));
  } else {
    await db.insert(riderProfiles).values({ userId: riderId, ratingAvg, punctualityScore });
  }
}

/**
 * `POST /trips/:id/ratings`. Enforces, server-side, independent of any
 * client-side UI constraint (CLAUDE.md's engineering standards):
 *  - the trip is actually completed,
 *  - the rater is one of the trip's two real parties, rating in the
 *    direction that matches who they are (a rider can't submit a
 *    `driver_rates_rider` rating for someone else's trip),
 *  - one rating per (tripId, raterUserId) — 409 on a duplicate,
 *  - the 24h submission window (packages/domain/src/rating/rating-window.ts)
 *    — 409 on an expired window, not a silent no-op.
 */
export async function createRating(
  db: Database,
  tripId: string,
  raterUserId: string,
  input: CreateRatingInput,
) {
  const trip = await db.query.trips.findFirst({
    where: eq(trips.id, tripId),
    with: { booking: { with: { ride: { with: { driverProfile: true } } } } },
  });
  if (!trip) throw new NotFoundError('Trip');
  if (trip.status !== 'completed' || !trip.completedAt) {
    throw new ConflictError('Ratings can only be left after the trip is completed');
  }
  if (!isWithinRatingWindow(trip.completedAt)) {
    throw new ConflictError('The 24-hour rating window for this trip has expired');
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
    where: and(eq(ratings.tripId, tripId), eq(ratings.raterUserId, raterUserId)),
  });
  if (existing) throw new ConflictError('You have already rated this trip');

  const isFirstRatingForTrip =
    (await db.query.ratings.findMany({ where: eq(ratings.tripId, tripId) })).length === 0;

  const [rating] = await db
    .insert(ratings)
    .values({
      tripId,
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

  if (input.role === 'rider_rates_driver') {
    await recomputeDriverAggregates(db, driverUserId);
  } else {
    await recomputeRiderAggregates(db, riderId);
  }

  return rating;
}

interface TierAggregate {
  tier: TrustTier;
  ratingAvg: number;
  tripCount: number;
  punctualityScore: number;
}

/**
 * `GET /users/:id/trust-summary` — the public-safe shape
 * (docs/roadmap/phase-09-ratings-trust.md's explicit API contract):
 * aggregate scores and the computed tier only, for whichever of
 * driver/rider reputations this user actually has. Never includes raw
 * comment text — that stays private to the trip's two parties (and, to
 * themselves, their own submitted comment), which this endpoint doesn't
 * expose at all in either direction.
 */
export async function getTrustSummary(db: Database, userId: string) {
  const user = await getUserById(db, userId);
  const accountAgeDays = Math.max(
    0,
    (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24),
  );

  const [driverProfile, riderProfile] = await Promise.all([
    db.query.driverProfiles.findFirst({ where: eq(driverProfiles.userId, userId) }),
    db.query.riderProfiles.findFirst({ where: eq(riderProfiles.userId, userId) }),
  ]);

  let driver: TierAggregate | null = null;
  if (driverProfile) {
    driver = {
      tier: computeTrustTier({
        tripCount: driverProfile.tripCount,
        ratingAvg: driverProfile.ratingAvg,
        accountAgeDays,
      }),
      ratingAvg: driverProfile.ratingAvg,
      tripCount: driverProfile.tripCount,
      punctualityScore: driverProfile.punctualityScore,
    };
  }

  let rider: TierAggregate | null = null;
  if (riderProfile) {
    rider = {
      tier: computeTrustTier({
        tripCount: riderProfile.tripCount,
        ratingAvg: riderProfile.ratingAvg,
        accountAgeDays,
      }),
      ratingAvg: riderProfile.ratingAvg,
      tripCount: riderProfile.tripCount,
      punctualityScore: riderProfile.punctualityScore,
    };
  }

  return { userId, driver, rider };
}
