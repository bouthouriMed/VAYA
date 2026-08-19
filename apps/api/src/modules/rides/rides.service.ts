import { and, desc, eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { driverProfiles, rides, vehicles } from '../../db/schema/index.js';
import { ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { canTransitionRideStatus } from '@vaya/domain';
import { getRoute } from '../../lib/routing.js';
import type { CreateRideInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

async function getDriverProfileOrThrow(db: Database, userId: string) {
  const profile = await db.query.driverProfiles.findFirst({
    where: eq(driverProfiles.userId, userId),
  });
  if (!profile) {
    throw new ForbiddenError('Complete driver onboarding before publishing a ride');
  }
  return profile;
}

export async function createRide(db: Database, userId: string, input: CreateRideInput) {
  const profile = await getDriverProfileOrThrow(db, userId);

  const vehicle = await db.query.vehicles.findFirst({
    where: and(eq(vehicles.id, input.vehicleId), eq(vehicles.driverProfileId, profile.id)),
  });
  if (!vehicle) throw new ForbiddenError('This vehicle does not belong to you');

  const route = await getRoute(
    { lat: input.origin.lat, lng: input.origin.lng },
    { lat: input.destination.lat, lng: input.destination.lng },
  );

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
      contributionPerSeat: input.contributionPerSeat,
      status: 'published',
      routePolyline: route.polyline || null,
      estimatedDurationSec: route.durationSec,
    })
    .returning();
  if (!ride) throw new Error('Failed to create ride');
  return ride;
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
