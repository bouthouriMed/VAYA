import { and, eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { operationalConfigs } from '../../db/schema/index.js';
import {
  MAX_DETOUR_RATIO,
  DEFAULT_EXISTING_PASSENGER_IMPACT_THRESHOLDS,
  CANCELLATION_FREE_WINDOW_HOURS,
  CANCELLATION_MODERATE_WINDOW_MINUTES,
  NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE,
  NO_SHOW_MAX_REPORTER_DISTANCE_METERS,
  ROUTE_DEVIATION_NOISE_THRESHOLD_METERS,
  ROUTE_DEVIATION_REAL_THRESHOLD_METERS,
  BOOKING_REQUEST_RESPONSE_WINDOW_MINUTES,
  SAME_JOURNEY_PICKUP_RADIUS_METERS,
  SAME_JOURNEY_DROPOFF_RADIUS_METERS,
  SAME_JOURNEY_TIME_WINDOW_MINUTES,
  MAX_ACTIVE_REQUESTS_PER_JOURNEY,
} from '@vaya/domain';
import { getLogger } from '../../config/logger.js';
import { ValidationError } from '../../lib/errors.js';
import { logAdminAction } from '../admin/audit-log.service.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * The fully-resolved operational policy — every field always present,
 * either from the active admin-set row or from `packages/domain`'s own
 * pure default (docs/unified_driver_and_passenger_journey.md §28: "the
 * architecture must allow policy values to change without rewriting
 * domain logic" — every consumer reads this shape, never a hardcoded
 * constant directly).
 */
export interface ResolvedOperationalConfig {
  maxDetourRatio: number;
  existingPassengerMaxDelayRatio: number;
  existingPassengerMaxAbsoluteDelayMinutes: number;
  cancellationFreeWindowHours: number;
  cancellationModerateWindowMinutes: number;
  noShowMinMinutesAfterDeparture: number;
  noShowMaxReporterDistanceMeters: number;
  routeDeviationNoiseThresholdMeters: number;
  routeDeviationRealThresholdMeters: number;
  bookingResponseWindowMinutes: number;
  sameJourneyPickupRadiusMeters: number;
  sameJourneyDropoffRadiusMeters: number;
  sameJourneyTimeWindowMinutes: number;
  maxActiveRequestsPerJourney: number;
}

export const DEFAULT_RESOLVED_OPERATIONAL_CONFIG: ResolvedOperationalConfig = {
  maxDetourRatio: MAX_DETOUR_RATIO,
  existingPassengerMaxDelayRatio: DEFAULT_EXISTING_PASSENGER_IMPACT_THRESHOLDS.maxDelayRatio,
  existingPassengerMaxAbsoluteDelayMinutes: DEFAULT_EXISTING_PASSENGER_IMPACT_THRESHOLDS.maxAbsoluteDelayMinutes,
  cancellationFreeWindowHours: CANCELLATION_FREE_WINDOW_HOURS,
  cancellationModerateWindowMinutes: CANCELLATION_MODERATE_WINDOW_MINUTES,
  noShowMinMinutesAfterDeparture: NO_SHOW_MIN_MINUTES_AFTER_DEPARTURE,
  noShowMaxReporterDistanceMeters: NO_SHOW_MAX_REPORTER_DISTANCE_METERS,
  routeDeviationNoiseThresholdMeters: ROUTE_DEVIATION_NOISE_THRESHOLD_METERS,
  routeDeviationRealThresholdMeters: ROUTE_DEVIATION_REAL_THRESHOLD_METERS,
  bookingResponseWindowMinutes: BOOKING_REQUEST_RESPONSE_WINDOW_MINUTES,
  sameJourneyPickupRadiusMeters: SAME_JOURNEY_PICKUP_RADIUS_METERS,
  sameJourneyDropoffRadiusMeters: SAME_JOURNEY_DROPOFF_RADIUS_METERS,
  sameJourneyTimeWindowMinutes: SAME_JOURNEY_TIME_WINDOW_MINUTES,
  maxActiveRequestsPerJourney: MAX_ACTIVE_REQUESTS_PER_JOURNEY,
};

/**
 * Fetches the active `national`-scope operational config and resolves it
 * onto `ResolvedOperationalConfig` — any column left `null` on the row
 * (an admin hasn't overridden that particular threshold yet) falls back to
 * its own individual pure default, not the whole row falling back at once.
 * Never throws: matching/booking must not be blocked by a missing or
 * partial config row, same discipline `getActivePricingConfig` established.
 */
export async function getActiveOperationalConfig(db: Database): Promise<ResolvedOperationalConfig> {
  const config = await db.query.operationalConfigs.findFirst({
    where: and(eq(operationalConfigs.scope, 'national'), eq(operationalConfigs.active, true)),
  });

  if (!config) {
    getLogger().warn(
      'No active national operational_configs row found — falling back to @vaya/domain defaults for every threshold',
    );
    return DEFAULT_RESOLVED_OPERATIONAL_CONFIG;
  }

  return {
    maxDetourRatio: config.maxDetourRatio ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.maxDetourRatio,
    existingPassengerMaxDelayRatio:
      config.existingPassengerMaxDelayRatio ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.existingPassengerMaxDelayRatio,
    existingPassengerMaxAbsoluteDelayMinutes:
      config.existingPassengerMaxAbsoluteDelayMinutes ??
      DEFAULT_RESOLVED_OPERATIONAL_CONFIG.existingPassengerMaxAbsoluteDelayMinutes,
    cancellationFreeWindowHours:
      config.cancellationFreeWindowHours ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.cancellationFreeWindowHours,
    cancellationModerateWindowMinutes:
      config.cancellationModerateWindowMinutes ??
      DEFAULT_RESOLVED_OPERATIONAL_CONFIG.cancellationModerateWindowMinutes,
    noShowMinMinutesAfterDeparture:
      config.noShowMinMinutesAfterDeparture ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.noShowMinMinutesAfterDeparture,
    noShowMaxReporterDistanceMeters:
      config.noShowMaxReporterDistanceMeters ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.noShowMaxReporterDistanceMeters,
    routeDeviationNoiseThresholdMeters:
      config.routeDeviationNoiseThresholdMeters ??
      DEFAULT_RESOLVED_OPERATIONAL_CONFIG.routeDeviationNoiseThresholdMeters,
    routeDeviationRealThresholdMeters:
      config.routeDeviationRealThresholdMeters ??
      DEFAULT_RESOLVED_OPERATIONAL_CONFIG.routeDeviationRealThresholdMeters,
    bookingResponseWindowMinutes:
      config.bookingResponseWindowMinutes ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.bookingResponseWindowMinutes,
    sameJourneyPickupRadiusMeters:
      config.sameJourneyPickupRadiusMeters ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.sameJourneyPickupRadiusMeters,
    sameJourneyDropoffRadiusMeters:
      config.sameJourneyDropoffRadiusMeters ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.sameJourneyDropoffRadiusMeters,
    sameJourneyTimeWindowMinutes:
      config.sameJourneyTimeWindowMinutes ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.sameJourneyTimeWindowMinutes,
    maxActiveRequestsPerJourney:
      config.maxActiveRequestsPerJourney ?? DEFAULT_RESOLVED_OPERATIONAL_CONFIG.maxActiveRequestsPerJourney,
  };
}

export type OperationalConfigUpdateInput = Partial<
  Omit<ResolvedOperationalConfig, never>
>;

/**
 * Admin-only write path (`PATCH /admin/operational-config`, spec §28: "The
 * Admin Panel is the authoritative interface for setting and changing
 * these values"). Upserts the single active `national` row — creates it on
 * the first-ever admin edit (until then, every reader transparently uses
 * pure defaults), otherwise updates only the fields the admin actually
 * supplied, leaving every other column (including ones already
 * admin-overridden earlier) untouched.
 */
export async function updateOperationalConfig(
  db: Database,
  updates: OperationalConfigUpdateInput,
  adminUserId: string,
): Promise<ResolvedOperationalConfig> {
  for (const [key, value] of Object.entries(updates)) {
    if (typeof value === 'number' && (!Number.isFinite(value) || value < 0)) {
      throw new ValidationError(`${key} must be a non-negative finite number`);
    }
  }

  const existing = await db.query.operationalConfigs.findFirst({
    where: and(eq(operationalConfigs.scope, 'national'), eq(operationalConfigs.active, true)),
  });

  let targetId: string;
  if (existing) {
    await db
      .update(operationalConfigs)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(operationalConfigs.id, existing.id));
    targetId = existing.id;
  } else {
    const [inserted] = await db
      .insert(operationalConfigs)
      .values({ scope: 'national', active: true, ...updates })
      .returning();
    targetId = inserted!.id;
  }

  // CLAUDE.md: "No important admin action should happen invisibly" — these
  // values shift matching/cancellation/no-show behavior platform-wide, so
  // every change is attributed and diffable, same discipline
  // admin-rides.service.ts's RIDE_CANCELLED action already follows.
  await logAdminAction(db, {
    adminUserId,
    action: 'OPERATIONAL_CONFIG_UPDATED',
    targetType: 'operational_config',
    targetId,
    previousState: existing ?? null,
    newState: updates,
  });

  return getActiveOperationalConfig(db);
}
