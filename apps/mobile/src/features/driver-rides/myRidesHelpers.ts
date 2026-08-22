import type { Ride } from '../../state/api';

/**
 * Pure presentation logic behind the trips tab's driver dashboard
 * (stitch/publish_ride/my-rides-driver-dashboard.html) — no React, no
 * network, deterministic given its inputs so it unit-tests without mocks.
 */

const UPCOMING_RIDE_STATUSES = new Set<Ride['status']>(['draft', 'published', 'full']);

export function isUpcomingRide(ride: Ride, now: Date = new Date()): boolean {
  return UPCOMING_RIDE_STATUSES.has(ride.status) && new Date(ride.departureAt).getTime() > now.getTime();
}

/**
 * The hero card's ride: the soonest-departing upcoming drive, or null when
 * the driver has none (the whole hero section is then omitted — never
 * rendered with placeholder content).
 */
export function pickNextUpcomingRide(rides: Ride[], now: Date = new Date()): Ride | null {
  const upcoming = rides.filter((ride) => isUpcomingRide(ride, now));
  if (upcoming.length === 0) return null;
  return upcoming.reduce((soonest, ride) =>
    new Date(ride.departureAt).getTime() < new Date(soonest.departureAt).getTime() ? ride : soonest,
  );
}

/** Everything except the hero ride — upcoming first (soonest first), then
 *  past ones most recent first. */
export function orderRemainingRides(
  rides: Ride[],
  heroRideId: string | null,
  now: Date = new Date(),
): Ride[] {
  const remaining = rides.filter((ride) => ride.id !== heroRideId);
  const upcoming = remaining
    .filter((ride) => isUpcomingRide(ride, now))
    .sort(
      (a, b) => new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime(),
    );
  const past = remaining
    .filter((ride) => !isUpcomingRide(ride, now))
    .sort(
      (a, b) => new Date(b.departureAt).getTime() - new Date(a.departureAt).getTime(),
    );
  return [...upcoming, ...past];
}

/**
 * The mockup's "(Est.)" arrival line, computed ONLY from the real OSRM
 * duration the server stored on the ride — returns null when the ride has
 * no estimatedDurationSec (e.g. a haversine-fallback route), in which case
 * the UI shows no arrival time at all rather than an invented one.
 */
export function estimateArrivalLabel(
  departureAt: string,
  estimatedDurationSec: number | null,
): string | null {
  if (estimatedDurationSec === null || !Number.isFinite(estimatedDurationSec)) return null;
  const departure = new Date(departureAt);
  if (Number.isNaN(departure.getTime())) return null;
  const arrival = new Date(departure.getTime() + estimatedDurationSec * 1000);
  return arrival.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
}
