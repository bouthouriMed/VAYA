import { and, eq, inArray } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, rides } from '../../db/schema/index.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import { getRoute } from '../../lib/routing.js';
import { decodePolyline, projectPointOntoRoute, type LatLng } from '../../lib/polyline.js';

type Database = ReturnType<typeof getDatabase>;

/** A point within this distance of a ride endpoint (or of another
 *  waypoint) is the same place for routing purposes — matches the mobile
 *  trip hub's own DISTINCT_FROM_ENDPOINT threshold so the map and the
 *  itinerary list agree on which passenger points are separate stops. */
const SAME_PLACE_M = 300;
/** Google Routes accepts at most 25 intermediate waypoints. */
const MAX_WAYPOINTS = 25;

export interface ItineraryPassengerPoints {
  pickup: LatLng;
  dropoff: LatLng;
}

/**
 * Orders every passenger pickup/dropoff along the driver's route (each
 * booking's pickup always before its own dropoff), dropping points that
 * coincide with the ride's own origin/destination or with an earlier
 * waypoint. `routePoints` is the ride's stored route when it has one, or
 * just [origin, destination] — a projection onto the straight line still
 * gives a sane along-the-trip order when no road geometry exists. Pure.
 */
export function orderItineraryWaypoints(
  origin: LatLng,
  destination: LatLng,
  routePoints: LatLng[],
  passengers: ItineraryPassengerPoints[],
): LatLng[] {
  const line = routePoints.length >= 2 ? routePoints : [origin, destination];
  const placed: { point: LatLng; fraction: number }[] = [];
  for (const { pickup, dropoff } of passengers) {
    const pickupFraction = projectPointOntoRoute(pickup, line).fraction;
    // A dropoff can never come before its own pickup, whatever the
    // projection says (e.g. a detour point beside the route).
    const dropoffFraction = Math.max(projectPointOntoRoute(dropoff, line).fraction, pickupFraction + 1e-6);
    placed.push({ point: pickup, fraction: pickupFraction }, { point: dropoff, fraction: dropoffFraction });
  }

  const ordered: LatLng[] = [];
  for (const { point } of placed.sort((a, b) => a.fraction - b.fraction)) {
    const samePlace = (other: LatLng) => haversineDistanceMeters(point, other) <= SAME_PLACE_M;
    if (samePlace(origin) || samePlace(destination) || ordered.some(samePlace)) continue;
    ordered.push(point);
  }
  return ordered.slice(0, MAX_WAYPOINTS);
}

export interface ItineraryRoute {
  /** Encoded road polyline of the viewer's itinerary, or null when no
   *  routing engine was reachable (the client then shows an explicitly
   *  approximate line through `points`, never a fake road). */
  polyline: string | null;
  /** The itinerary's points in travel order (start, waypoints, end). */
  points: LatLng[];
  isEstimate: boolean;
}

/**
 * The real road itinerary to draw on a trip's map, for whoever is looking:
 *
 *  - the DRIVER sees their own whole trip, origin -> every accepted
 *    passenger's pickup/dropoff (in route order) -> destination — so a
 *    passenger picked up or dropped off beside the original route is on
 *    the line, not floating next to it;
 *  - a PASSENGER with a booking on the ride sees only their own leg,
 *    pickup -> dropoff (the driver's destination when they chose no
 *    dropoff stop).
 *
 * Computed live through the routing provider (Redis-cached by getRoute), so
 * a ride whose stored routePolyline is empty — published while routing was
 * unreachable — still gets a real route once routing is back.
 */
export async function getRideItineraryRoute(db: Database, rideId: string, userId: string): Promise<ItineraryRoute> {
  const ride = await db.query.rides.findFirst({
    where: eq(rides.id, rideId),
    with: { driverProfile: true },
  });
  if (!ride) throw new NotFoundError('Ride not found');

  const origin = { lat: ride.originLat, lng: ride.originLng };
  const destination = { lat: ride.destinationLat, lng: ride.destinationLng };

  if (ride.driverProfile.userId === userId) {
    const accepted = await db.query.bookings.findMany({
      where: and(eq(bookings.rideId, rideId), eq(bookings.status, 'accepted')),
    });
    const waypoints = orderItineraryWaypoints(
      origin,
      destination,
      ride.routePolyline ? decodePolyline(ride.routePolyline) : [],
      accepted.map((b) => ({
        pickup: { lat: b.pickupLat, lng: b.pickupLng },
        dropoff: { lat: b.dropoffLat ?? ride.destinationLat, lng: b.dropoffLng ?? ride.destinationLng },
      })),
    );
    // No passenger off the stored route: the stored road geometry IS the
    // itinerary — no routing call needed.
    if (waypoints.length === 0 && ride.routePolyline) {
      return { polyline: ride.routePolyline, points: [origin, destination], isEstimate: false };
    }
    const route = await getRoute(origin, destination, waypoints);
    return {
      polyline: route.polyline || null,
      points: [origin, ...waypoints, destination],
      isEstimate: route.isEstimate,
    };
  }

  const booking = await db.query.bookings.findFirst({
    where: and(
      eq(bookings.rideId, rideId),
      eq(bookings.riderId, userId),
      inArray(bookings.status, ['pending', 'accepted', 'completed']),
    ),
  });
  if (!booking) throw new ForbiddenError('Only the driver or a passenger of this ride can view its itinerary');

  const pickup = { lat: booking.pickupLat, lng: booking.pickupLng };
  const dropoff = { lat: booking.dropoffLat ?? ride.destinationLat, lng: booking.dropoffLng ?? ride.destinationLng };
  const route = await getRoute(pickup, dropoff);
  return { polyline: route.polyline || null, points: [pickup, dropoff], isEstimate: route.isEstimate };
}
