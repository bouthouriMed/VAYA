import { and, desc, eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { driverProfiles, recurringPatterns, rides, vehicles } from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { canTransitionRideStatus, computeSuggestedPrice, type SuggestedPrice } from '@vaya/domain';
import { getRoute, type RouteResult } from '../../lib/routing.js';
import { getActivePricingConfig } from '../pricing/pricing.service.js';
import type { CreateRideInput, UpdateRideInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

/** Result of `createRide`/`updateRide` — the persisted ride row plus the
 *  route-derived price suggestion computed alongside it. `pricing` is never
 *  a DB column; it's recomputed fresh on every call (see the doc comment
 *  on `suggestPriceForRoute` below for why that's cheap in practice) so it
 *  can never silently drift from what bound-enforcement actually checked.
 *  `routeIsEstimate` mirrors `lib/routing.ts`'s `RouteResult.isEstimate` —
 *  lets the client show an honest "wider margin, estimate" caption
 *  (`PriceRangeStepper`'s `isEstimate` prop) instead of presenting a
 *  haversine-derived bound as if it were real OSRM precision. */
export interface RideWithPricing {
  pricing: SuggestedPrice;
  routeIsEstimate: boolean;
}

/** Computes the bounded price suggestion for a given origin/destination —
 *  shared by `createRide` (route is being computed for the first time) and
 *  `updateRide` (re-deriving the same bounds to independently re-validate a
 *  price change, per docs/domain/pricing.md: "Driver edits route after a
 *  price was suggested: recompute and re-prompt; don't silently keep a
 *  stale suggestion"). `getRoute` is Redis-cached by coordinate pair
 *  (lib/routing.ts), so calling it again for the same ride's unchanged
 *  origin/destination on a later `updateRide` call is a cache hit, not a
 *  second real OSRM round-trip. */
async function suggestPriceForRoute(db: Database, route: RouteResult): Promise<SuggestedPrice> {
  const config = await getActivePricingConfig(db);
  return computeSuggestedPrice(route.distanceM / 1000, route.durationSec / 60, config, {
    isEstimate: route.isEstimate,
  });
}

async function getDriverProfileOrThrow(db: Database, userId: string) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
  });
  if (!profile) {
    throw new ForbiddenError('Complete driver onboarding before publishing a ride');
  }
  return profile;
}

/** Builds the "value X is outside [min, max]" message the client sees on a
 *  400 — a clear, specific message rather than generic Zod validation
 *  noise, per docs/roadmap/phase-06-pricing-engine.md's API section. */
function outOfBoundsMessage(value: number, pricing: SuggestedPrice): string {
  return (
    `Contribution per seat must be between ${pricing.min} and ${pricing.max} DT ` +
    `for this route (got ${value} DT).`
  );
}

export async function createRide(
  db: Database,
  userId: string,
  input: CreateRideInput,
): Promise<typeof rides.$inferSelect & RideWithPricing> {
  const profile = await getDriverProfileOrThrow(db, userId);

  const vehicle = await db.query.vehicles.findFirst({
    where: and(eq(vehicles.id, input.vehicleId), eq(vehicles.driverProfileId, profile.id)),
  });
  if (!vehicle) throw new ForbiddenError('This vehicle does not belong to you');

  // Phase 11 (docs/roadmap/phase-11-recurring-rides.md): the driver
  // auto-draft flow tags the created ride with the `enabled` driver pattern
  // it originated from. Never trust the client's word alone that this
  // pattern belongs to them and is actually enabled — the same
  // server-authoritative discipline as the vehicle-ownership check above.
  if (input.recurringPatternId) {
    const pattern = await db.query.recurringPatterns.findFirst({
      where: eq(recurringPatterns.id, input.recurringPatternId),
    });
    if (
      !pattern ||
      pattern.userId !== userId ||
      pattern.role !== 'driver' ||
      pattern.status !== 'enabled'
    ) {
      throw new ForbiddenError('This recurring pattern cannot be used to draft a ride');
    }
  }

  const route = await getRoute(
    { lat: input.origin.lat, lng: input.origin.lng },
    { lat: input.destination.lat, lng: input.destination.lng },
  );

  // Phase 6 (docs/domain/pricing.md): computed right after the route, using
  // the same call that already produced routePolyline/estimatedDurationSec
  // above — no extra OSRM round-trip. If the driver already supplied a
  // price, it must fall within the computed bound (server-authoritative,
  // independent of any client-side clamping — a direct API call with an
  // out-of-bounds value is rejected here too). If omitted, default to the
  // suggestion's `recommended` value.
  const pricing = await suggestPriceForRoute(db, route);
  const contributionPerSeat = input.contributionPerSeat ?? pricing.recommended;
  if (
    input.contributionPerSeat !== undefined &&
    (contributionPerSeat < pricing.min || contributionPerSeat > pricing.max)
  ) {
    throw new ValidationError(outOfBoundsMessage(contributionPerSeat, pricing), {
      contributionPerSeat: [outOfBoundsMessage(contributionPerSeat, pricing)],
    });
  }

  const [ride] = await db
    .insert(rides)
    .values({
      driverProfileId: profile.id,
      vehicleId: vehicle.id,
      routeId: input.routeId,
      originLabel: input.origin.label,
      originLat: input.origin.lat,
      originLng: input.origin.lng,
      destinationLabel: input.destination.label,
      destinationLat: input.destination.lat,
      destinationLng: input.destination.lng,
      departureAt: input.departureAt,
      seatsTotal: input.seatsTotal,
      seatsAvailable: input.seatsTotal,
      contributionPerSeat,
      // Created as a draft, not immediately published: the ride-engine flow
      // (docs/domain/ride-engine.md) generates candidate stops against this
      // ride's now-computed routePolyline before the driver actually
      // publishes — see stop-candidates.service.ts and the new
      // POST /rides/:id/publish route. Mobile's publish.tsx drives both
      // steps in one flow, but the API models them as two distinct calls.
      status: 'draft',
      routePolyline: route.polyline || null,
      estimatedDurationSec: route.durationSec,
      recurringPatternId: input.recurringPatternId ?? null,
    })
    .returning();
  if (!ride) throw new Error('Failed to create ride');
  return { ...ride, pricing, routeIsEstimate: route.isEstimate };
}

/** Lets the driver adjust `contributionPerSeat` (and/or departure/seats)
 *  before publishing — the second half of the price step in the mobile
 *  flow (`driver/publish.tsx`), called after the driver sees the bounds
 *  `createRide` returned and drags the bounded price control away from
 *  `recommended`. Restricted to `draft` rides: once published, a price
 *  change would silently move the number under bookings already made
 *  against it, which is a materially different (and out of scope) product
 *  decision.
 *
 *  Re-derives the bound from the ride's own stored origin/destination
 *  rather than trusting any bound the client remembers from creation —
 *  the same server-authoritative rule as `createRide`, so a direct API
 *  call bypassing the UI is rejected here too. */
export async function updateRide(
  db: Database,
  rideId: string,
  userId: string,
  input: UpdateRideInput,
): Promise<typeof rides.$inferSelect & RideWithPricing> {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  if (ride.driverProfile.userId !== userId) {
    throw new ForbiddenError('Only the driver who created this ride can edit it');
  }
  if (ride.status !== 'draft') {
    throw new ConflictError('Only a draft ride can be edited before publishing');
  }

  const route = await getRoute(
    { lat: ride.originLat, lng: ride.originLng },
    { lat: ride.destinationLat, lng: ride.destinationLng },
  );
  const pricing = await suggestPriceForRoute(db, route);

  let contributionPerSeat = ride.contributionPerSeat;
  if (input.contributionPerSeat !== undefined) {
    if (input.contributionPerSeat < pricing.min || input.contributionPerSeat > pricing.max) {
      throw new ValidationError(outOfBoundsMessage(input.contributionPerSeat, pricing), {
        contributionPerSeat: [outOfBoundsMessage(input.contributionPerSeat, pricing)],
      });
    }
    contributionPerSeat = input.contributionPerSeat;
  }

  const [updated] = await db
    .update(rides)
    .set({
      ...(input.departureAt !== undefined ? { departureAt: input.departureAt } : {}),
      // A draft ride can't have bookings yet, so resetting seatsAvailable
      // alongside seatsTotal here can never strand an already-accepted
      // booking's seat accounting.
      ...(input.seatsTotal !== undefined
        ? { seatsTotal: input.seatsTotal, seatsAvailable: input.seatsTotal }
        : {}),
      contributionPerSeat,
      updatedAt: new Date(),
    })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) throw new Error('Failed to update ride');
  return { ...updated, pricing, routeIsEstimate: route.isEstimate };
}

export async function listMyRides(db: Database, userId: string) {
  const profile = await getDriverProfileOrThrow(db, userId);
  return db.query.rides.findMany({
    where: eq(rides.driverProfileId, profile.id),
    orderBy: desc(rides.departureAt),
  });
}

export async function getRideById(db: Database, rideId: string) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: { with: { user: true } }, vehicle: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  return ride;
}

/** Transitions a ride from `draft` to `published` — the second half of the
 *  ride-creation flow now that candidate-stop generation/selection
 *  (stop-candidates.service.ts) happens between the two. Reuses the
 *  existing authoritative state machine (`canTransitionRideStatus` from
 *  `@vaya/domain`) rather than duplicating transition logic here. */
export async function publishRide(db: Database, rideId: string, userId: string) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  if (ride.driverProfile.userId !== userId) {
    throw new ForbiddenError('Only the driver who created this ride can publish it');
  }
  if (!canTransitionRideStatus(ride.status, 'published')) {
    throw new ConflictError(`Cannot publish a ride in status "${ride.status}"`);
  }

  const [updated] = await db
    .update(rides)
    .set({ status: 'published', updatedAt: new Date() })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) throw new Error('Failed to publish ride');
  return updated;
}

export async function cancelRide(db: Database, rideId: string, userId: string) {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: true },
  });
  if (!ride) throw new NotFoundError('Ride');
  if (ride.driverProfile.userId !== userId) {
    throw new ForbiddenError('Only the driver who published this ride can cancel it');
  }
  if (!canTransitionRideStatus(ride.status, 'cancelled')) {
    throw new ConflictError(`Cannot cancel a ride in status "${ride.status}"`);
  }

  const [updated] = await db
    .update(rides)
    .set({ status: 'cancelled', updatedAt: new Date() })
    .where(eq(rides.id, rideId))
    .returning();
  if (!updated) throw new Error('Failed to cancel ride');
  return updated;
}
