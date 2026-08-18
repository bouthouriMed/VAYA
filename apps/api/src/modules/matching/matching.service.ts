import { and, eq, gte, lte } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { demandSignals, rides } from '../../db/schema/index.js';
import { haversineDistanceMeters } from '../../lib/geo.js';
import type { MatchingSearchInput, NotifyMeInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

const TIGHT_PICKUP_RADIUS_M = 2000;
const TIGHT_DROPOFF_RADIUS_M = 3000;
const TIGHT_TIME_WINDOW_MIN = 90;

const WIDE_PICKUP_RADIUS_M = 8000;
const WIDE_DROPOFF_RADIUS_M = 10000;
const WIDE_TIME_WINDOW_MIN = 240;

const WALK_SPEED_M_PER_MIN = 80;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

export interface MatchCandidate {
  rideId: string;
  driverUserId: string;
  driverFullName: string | null;
  ratingAvg: number;
  tripCount: number;
  departureAt: Date;
  seatsAvailable: number;
  contributionPerSeat: number;
  pickupWalkMinutes: number;
  routeOverlapPercent: number;
  score: number;
  reasons: string[];
  clusterLabel: string;
}

function buildClusterLabel(timeDeltaMin: number): string {
  if (timeDeltaMin <= 10) return 'Maintenant';
  const rounded = Math.round(timeDeltaMin / 10) * 10;
  return `+${rounded} min`;
}

function buildReasons(params: {
  pickupWalkMinutes: number;
  timeDeltaMin: number;
  routeOverlapPercent: number;
  reliabilityScore: number;
}): string[] {
  const reasons: string[] = [];
  if (params.pickupWalkMinutes <= 5)
    reasons.push(`${Math.round(params.pickupWalkMinutes)} min à pied`);
  if (params.routeOverlapPercent >= 85)
    reasons.push(`${Math.round(params.routeOverlapPercent)}% de trajet commun`);
  if (params.timeDeltaMin <= 15) reasons.push('Proche de votre horaire');
  if (params.reliabilityScore >= 0.9) reasons.push('Conducteur très fiable');
  return reasons;
}

async function scoreCandidates(
  db: Database,
  input: MatchingSearchInput,
  pickupRadiusM: number,
  dropoffRadiusM: number,
  timeWindowMin: number,
): Promise<MatchCandidate[]> {
  const windowStart = new Date(input.when.getTime() - timeWindowMin * 60_000);
  const windowEnd = new Date(input.when.getTime() + timeWindowMin * 60_000);

  const candidates = await db.query.rides.findMany({
    where: and(
      eq(rides.status, 'published'),
      gte(rides.departureAt, windowStart),
      lte(rides.departureAt, windowEnd),
    ),
    with: { driverProfile: { with: { user: true } } },
  });

  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };

  const scored: MatchCandidate[] = [];
  for (const ride of candidates) {
    if (ride.seatsAvailable < 1) continue;

    const pickupDistanceM = haversineDistanceMeters(origin, {
      lat: ride.originLat,
      lng: ride.originLng,
    });
    const dropoffDistanceM = haversineDistanceMeters(destination, {
      lat: ride.destinationLat,
      lng: ride.destinationLng,
    });
    if (pickupDistanceM > pickupRadiusM || dropoffDistanceM > dropoffRadiusM) continue;

    const timeDeltaMin = Math.abs(ride.departureAt.getTime() - input.when.getTime()) / 60_000;
    const pickupWalkMinutes = pickupDistanceM / WALK_SPEED_M_PER_MIN;
    const routeOverlapPercent =
      100 *
      (1 -
        (pickupDistanceM / TIGHT_PICKUP_RADIUS_M + dropoffDistanceM / TIGHT_DROPOFF_RADIUS_M) / 2);

    const score =
      clamp01(1 - pickupDistanceM / TIGHT_PICKUP_RADIUS_M) * 0.4 +
      clamp01(1 - timeDeltaMin / TIGHT_TIME_WINDOW_MIN) * 0.3 +
      clamp01(1 - dropoffDistanceM / TIGHT_DROPOFF_RADIUS_M) * 0.3;

    scored.push({
      rideId: ride.id,
      driverUserId: ride.driverProfile.userId,
      driverFullName: ride.driverProfile.user?.fullName ?? null,
      ratingAvg: ride.driverProfile.ratingAvg,
      tripCount: ride.driverProfile.tripCount,
      departureAt: ride.departureAt,
      seatsAvailable: ride.seatsAvailable,
      contributionPerSeat: ride.contributionPerSeat,
      pickupWalkMinutes,
      routeOverlapPercent: clamp01(routeOverlapPercent / 100) * 100,
      score,
      reasons: buildReasons({
        pickupWalkMinutes,
        timeDeltaMin,
        routeOverlapPercent,
        reliabilityScore: ride.driverProfile.reliabilityScore,
      }),
      clusterLabel: buildClusterLabel(timeDeltaMin),
    });
  }

  return scored.sort((a, b) => b.score - a.score);
}

export async function searchRides(
  db: Database,
  input: MatchingSearchInput,
): Promise<MatchCandidate[]> {
  return scoreCandidates(
    db,
    input,
    TIGHT_PICKUP_RADIUS_M,
    TIGHT_DROPOFF_RADIUS_M,
    TIGHT_TIME_WINDOW_MIN,
  );
}

export interface CorridorFallback {
  nearbyRides: MatchCandidate[];
  demandSignalCount: number;
}

export async function corridorFallback(
  db: Database,
  input: MatchingSearchInput,
): Promise<CorridorFallback> {
  const tight = await scoreCandidates(
    db,
    input,
    TIGHT_PICKUP_RADIUS_M,
    TIGHT_DROPOFF_RADIUS_M,
    TIGHT_TIME_WINDOW_MIN,
  );
  const wide = await scoreCandidates(
    db,
    input,
    WIDE_PICKUP_RADIUS_M,
    WIDE_DROPOFF_RADIUS_M,
    WIDE_TIME_WINDOW_MIN,
  );
  const tightIds = new Set(tight.map((c) => c.rideId));
  const nearbyRides = wide.filter((c) => !tightIds.has(c.rideId));

  const demand = await db.query.demandSignals.findMany({ where: eq(demandSignals.status, 'open') });
  const origin = { lat: input.originLat, lng: input.originLng };
  const destination = { lat: input.destinationLat, lng: input.destinationLng };
  const demandSignalCount = demand.filter((signal) => {
    const originClose =
      haversineDistanceMeters(origin, { lat: signal.originLat, lng: signal.originLng }) <=
      WIDE_PICKUP_RADIUS_M;
    const destinationClose =
      haversineDistanceMeters(destination, {
        lat: signal.destinationLat,
        lng: signal.destinationLng,
      }) <= WIDE_DROPOFF_RADIUS_M;
    return originClose && destinationClose;
  }).length;

  return { nearbyRides, demandSignalCount };
}

export async function createDemandSignal(db: Database, userId: string, input: NotifyMeInput) {
  const [signal] = await db
    .insert(demandSignals)
    .values({
      userId,
      originLabel: input.origin.label,
      originLat: input.origin.lat,
      originLng: input.origin.lng,
      destinationLabel: input.destination.label,
      destinationLat: input.destination.lat,
      destinationLng: input.destination.lng,
      desiredWindowStart: input.desiredWindowStart,
      desiredWindowEnd: input.desiredWindowEnd,
    })
    .returning();
  if (!signal) throw new Error('Failed to create demand signal');
  return signal;
}
