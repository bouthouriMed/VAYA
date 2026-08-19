import { and, eq, gte, inArray, lte } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { bookings, recurringPatterns, rides } from '../../db/schema/index.js';
import { ForbiddenError, NotFoundError, ConflictError } from '../../lib/errors.js';
import {
  canTransitionRecurringPatternStatus,
  computeRecurringPatternStatus,
  dayOfWeekMaskIncludes,
  detectRecurringPatterns,
  nextOccurrenceForPattern,
  shouldResuggestAfterDismissal,
  type DetectedRecurringPattern,
  type RecurringDetectionConfig,
  type RecurringPatternRole,
  type TripHistoryRecord,
} from '@vaya/domain';
import { findBestMatchForRecurringPattern as matchingFindBestMatch } from '../matching/matching.service.js';
import { notifyBestEffort } from '../notifications/notifications.service.js';
import { getActiveRecurringDetectionConfig } from './recurring-config.service.js';
import type { UpdateRecurringPatternInput } from '@vaya/validation';

type Database = ReturnType<typeof getDatabase>;

// A pattern only just matched shouldn't be re-notified again immediately on
// the next scan run — a plain operational cadence constant (not a business
// threshold, so it isn't part of the externalized config), giving a rider
// roughly one proactive nudge per day rather than one per job tick.
const PROACTIVE_MATCH_COOLDOWN_MS = 12 * 60 * 60 * 1000;

// history rows we actually consider "happened" for detection purposes —
// excludes draft/cancelled rides and pending/declined/cancelled bookings,
// which were never real trips.
const DRIVER_HISTORY_RIDE_STATUSES = ['published', 'full', 'in_progress', 'completed'] as const;
const RIDER_HISTORY_BOOKING_STATUSES = ['accepted', 'completed'] as const;

export async function listMyRecurringPatterns(db: Database, userId: string) {
  const patterns = await db.query.recurringPatterns.findMany({
    where: eq(recurringPatterns.userId, userId),
  });

  // For an enabled driver pattern, tell the client whether *today* is even
  // a match day and whether a draft ride already exists for it — lets the
  // pattern-management/prompt UI decide whether to offer "confirm today's
  // ride" without re-deriving day-of-week logic client-side.
  const enabledDriverPatternIds = patterns
    .filter((p) => p.role === 'driver' && p.status === 'enabled')
    .map((p) => p.id);

  const todayRideByPatternId = new Map<string, string>();
  if (enabledDriverPatternIds.length > 0) {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date();
    endOfDay.setHours(23, 59, 59, 999);

    const todaysRides = await db.query.rides.findMany({
      where: and(
        inArray(rides.recurringPatternId, enabledDriverPatternIds),
        gte(rides.departureAt, startOfDay),
        lte(rides.departureAt, endOfDay),
      ),
    });
    for (const ride of todaysRides) {
      if (ride.recurringPatternId) todayRideByPatternId.set(ride.recurringPatternId, ride.id);
    }
  }

  const now = new Date();
  return patterns.map((pattern) => ({
    ...pattern,
    matchesToday:
      pattern.role === 'driver' && pattern.status === 'enabled'
        ? dayOfWeekMaskIncludes(pattern.daysOfWeekMask, now)
        : false,
    todayRideId: todayRideByPatternId.get(pattern.id) ?? null,
  }));
}

export async function updateRecurringPatternStatus(
  db: Database,
  patternId: string,
  userId: string,
  input: UpdateRecurringPatternInput,
) {
  const pattern = await db.query.recurringPatterns.findFirst({
    where: eq(recurringPatterns.id, patternId),
  });
  if (!pattern) throw new NotFoundError('Recurring pattern');
  if (pattern.userId !== userId) {
    throw new ForbiddenError('Not authorized to modify this recurring pattern');
  }

  const nextStatus = input.action === 'enable' ? 'enabled' : 'dismissed';
  if (!canTransitionRecurringPatternStatus(pattern.status, nextStatus)) {
    throw new ConflictError(`Cannot ${input.action} a pattern in status "${pattern.status}"`);
  }

  const [updated] = await db
    .update(recurringPatterns)
    .set({ status: nextStatus, updatedAt: new Date() })
    .where(eq(recurringPatterns.id, patternId))
    .returning();
  if (!updated) throw new Error('Failed to update recurring pattern');
  return updated;
}

function toHistoryRecord(row: {
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  departureAt: Date;
}): TripHistoryRecord {
  return {
    originLabel: row.originLabel,
    originLat: row.originLat,
    originLng: row.originLng,
    destinationLabel: row.destinationLabel,
    destinationLat: row.destinationLat,
    destinationLng: row.destinationLng,
    departureAt: row.departureAt,
  };
}

async function loadHistoryByUser(
  db: Database,
  config: RecurringDetectionConfig,
): Promise<{ driver: Map<string, TripHistoryRecord[]>; rider: Map<string, TripHistoryRecord[]> }> {
  const since = new Date(Date.now() - config.lookbackDays * 86_400_000);
  const now = new Date();

  const driverRides = await db.query.rides.findMany({
    where: and(
      gte(rides.departureAt, since),
      lte(rides.departureAt, now),
      inArray(rides.status, [...DRIVER_HISTORY_RIDE_STATUSES]),
    ),
    with: { driverProfile: true },
  });
  const driver = new Map<string, TripHistoryRecord[]>();
  for (const ride of driverRides) {
    const userId = ride.driverProfile.userId;
    const list = driver.get(userId) ?? [];
    list.push(toHistoryRecord(ride));
    driver.set(userId, list);
  }

  const riderBookings = await db.query.bookings.findMany({
    where: inArray(bookings.status, [...RIDER_HISTORY_BOOKING_STATUSES]),
    with: { ride: true },
  });
  const rider = new Map<string, TripHistoryRecord[]>();
  for (const booking of riderBookings) {
    if (booking.ride.departureAt < since || booking.ride.departureAt > now) continue;
    const list = rider.get(booking.riderId) ?? [];
    list.push(toHistoryRecord(booking.ride));
    rider.set(booking.riderId, list);
  }

  return { driver, rider };
}

type UpsertOutcome = 'created' | 'created-suggested' | 'refined' | 'resurrected' | 'skipped';

/**
 * Writes (or refines/resurrects) one detected corridor cluster as a
 * `recurring_patterns` row for one user+role. See
 * packages/domain/src/recurring/should-resuggest-after-dismissal.ts's doc
 * comment for the dismissed-pattern re-suggestion rule this enforces, and
 * `recurring-pattern-status.ts` for the detected/suggested promotion rule.
 * An `enabled` pattern is left entirely untouched by detection — it's
 * already active; refining its stored corridor/time-window out from under
 * an in-flight auto-draft/proactive-match flow would be a correctness bug,
 * not a feature.
 */
async function upsertDetectedPattern(
  db: Database,
  userId: string,
  role: RecurringPatternRole,
  candidate: DetectedRecurringPattern,
  config: RecurringDetectionConfig,
): Promise<UpsertOutcome> {
  const existingForUserRole = await db.query.recurringPatterns.findMany({
    where: and(eq(recurringPatterns.userId, userId), eq(recurringPatterns.role, role)),
  });
  const existing = existingForUserRole.find(
    (p) =>
      haversineDistanceMeters(
        { lat: p.originLat, lng: p.originLng },
        { lat: candidate.originLat, lng: candidate.originLng },
      ) <= config.corridorRadiusMeters &&
      haversineDistanceMeters(
        { lat: p.destinationLat, lng: p.destinationLng },
        { lat: candidate.destinationLat, lng: candidate.destinationLng },
      ) <= config.corridorRadiusMeters,
  );

  const nextStatus = computeRecurringPatternStatus(candidate.confidenceScore, config);
  const candidateColumns = {
    originLabel: candidate.originLabel,
    originLat: candidate.originLat,
    originLng: candidate.originLng,
    destinationLabel: candidate.destinationLabel,
    destinationLat: candidate.destinationLat,
    destinationLng: candidate.destinationLng,
    daysOfWeekMask: candidate.daysOfWeekMask,
    timeWindowStart: candidate.timeWindowStart,
    timeWindowEnd: candidate.timeWindowEnd,
    confidenceScore: candidate.confidenceScore,
  };

  if (!existing) {
    const [inserted] = await db
      .insert(recurringPatterns)
      .values({ userId, role, status: nextStatus, ...candidateColumns })
      .returning();
    if (nextStatus === 'suggested' && inserted) {
      await notifyBestEffort(db, userId, 'recurring_pattern_detected', {
        patternId: inserted.id,
        role,
      });
      return 'created-suggested';
    }
    return 'created';
  }

  if (existing.status === 'enabled') return 'skipped';

  if (existing.status === 'dismissed') {
    if (!shouldResuggestAfterDismissal(existing.confidenceScore, candidate.confidenceScore, config)) {
      return 'skipped';
    }
    await db
      .update(recurringPatterns)
      .set({ status: nextStatus, updatedAt: new Date(), ...candidateColumns })
      .where(eq(recurringPatterns.id, existing.id));
    if (nextStatus === 'suggested') {
      await notifyBestEffort(db, userId, 'recurring_pattern_detected', {
        patternId: existing.id,
        role,
      });
    }
    return 'resurrected';
  }

  // existing.status is 'detected' or 'suggested' — refine in place with the
  // freshly recomputed evidence.
  const wasAlreadySuggested = existing.status === 'suggested';
  await db
    .update(recurringPatterns)
    .set({ status: nextStatus, updatedAt: new Date(), ...candidateColumns })
    .where(eq(recurringPatterns.id, existing.id));
  if (nextStatus === 'suggested' && !wasAlreadySuggested) {
    await notifyBestEffort(db, userId, 'recurring_pattern_detected', {
      patternId: existing.id,
      role,
    });
  }
  return 'refined';
}

/**
 * Phase 11's proactive rider-match check: for every `enabled` rider
 * pattern, computes its next matching occurrence and asks
 * `matching.service.ts`'s `findBestMatchForRecurringPattern` whether a real
 * published ride currently satisfies it — if so, fires
 * `recurring_proactive_match` (Phase 7's existing dispatch path) without
 * the rider ever re-searching. `lastMatchedAt` gates re-notifying for the
 * same match within `PROACTIVE_MATCH_COOLDOWN_MS`.
 */
export async function checkProactiveMatchesForEnabledRiderPatterns(db: Database): Promise<number> {
  const enabledRiderPatterns = await db.query.recurringPatterns.findMany({
    where: and(eq(recurringPatterns.role, 'rider'), eq(recurringPatterns.status, 'enabled')),
  });

  let notified = 0;
  for (const pattern of enabledRiderPatterns) {
    if (
      pattern.lastMatchedAt &&
      Date.now() - pattern.lastMatchedAt.getTime() < PROACTIVE_MATCH_COOLDOWN_MS
    ) {
      continue;
    }

    const nextOccurrence = nextOccurrenceForPattern(pattern);
    if (!nextOccurrence) continue;

    const match = await matchingFindBestMatch(db, pattern, nextOccurrence);
    if (!match) continue;

    await notifyBestEffort(db, pattern.userId, 'recurring_proactive_match', {
      patternId: pattern.id,
      rideId: match.rideId,
    });
    await db
      .update(recurringPatterns)
      .set({ lastMatchedAt: new Date(), updatedAt: new Date() })
      .where(eq(recurringPatterns.id, pattern.id));
    notified += 1;
  }
  return notified;
}

export interface RecurringPatternScanResult {
  usersScanned: number;
  created: number;
  refined: number;
  resurrected: number;
  proactiveMatchesNotified: number;
}

/**
 * The Phase 11 background job's actual work (dispatched via
 * apps/api/src/lib/queue.ts's `recurring-pattern-scan` job on the same
 * BullMQ queue/worker process Phase 7 established — no second queue).
 * Two responsibilities, run together since both are periodic
 * recurring-pattern maintenance on the same cadence:
 *
 *  1. Detection — scan every user's driver/rider trip history, cluster by
 *     corridor (`@vaya/domain`'s `detectRecurringPatterns`), and
 *     create/refine/resurrect `recurring_patterns` rows.
 *  2. Proactive rider-matching — for every already-`enabled` rider
 *     pattern, check for a real matching published ride right now.
 */
export async function runRecurringPatternDetectionScan(
  db: Database,
): Promise<RecurringPatternScanResult> {
  const config = await getActiveRecurringDetectionConfig(db);
  const { driver, rider } = await loadHistoryByUser(db, config);

  let created = 0;
  let refined = 0;
  let resurrected = 0;
  let usersScanned = 0;

  for (const [role, historyByUser] of [
    ['driver', driver],
    ['rider', rider],
  ] as const) {
    for (const [userId, history] of historyByUser) {
      usersScanned += 1;
      const detected = detectRecurringPatterns(history, config);
      for (const candidate of detected) {
        const outcome = await upsertDetectedPattern(db, userId, role, candidate, config);
        if (outcome === 'created' || outcome === 'created-suggested') created += 1;
        else if (outcome === 'refined') refined += 1;
        else if (outcome === 'resurrected') resurrected += 1;
      }
    }
  }

  const proactiveMatchesNotified = await checkProactiveMatchesForEnabledRiderPatterns(db);

  return { usersScanned, created, refined, resurrected, proactiveMatchesNotified };
}

// Local duplicate of the same haversine formula used across this codebase
// (apps/api/src/lib/geo.ts, packages/domain/src/recurring/recurring-geo.ts)
// — kept inline here rather than importing lib/geo.ts to avoid pulling an
// unrelated module in just for one helper; trivial, stable math, not worth
// a shared import for.
const EARTH_RADIUS_M = 6_371_000;
function toRadians(deg: number): number {
  return (deg * Math.PI) / 180;
}
function haversineDistanceMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h));
}
