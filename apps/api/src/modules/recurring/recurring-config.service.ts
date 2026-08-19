import { and, eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { recurringDetectionConfigs } from '../../db/schema/index.js';
import { DEFAULT_RECURRING_DETECTION_CONFIG, type RecurringDetectionConfig } from '@vaya/domain';
import { getLogger } from '../../config/logger.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * Fetches the active `global`-scope recurring-detection config and maps it
 * onto `@vaya/domain`'s pure `RecurringDetectionConfig` shape — mirrors
 * `pricing.service.ts`'s `getActivePricingConfig` exactly (Phase 6's
 * externalized-tunable pattern, applied here to Phase 11's detection
 * thresholds).
 *
 * Never throws: a missing config row must not block the detection job or
 * any endpoint that reads thresholds — falls back to
 * `DEFAULT_RECURRING_DETECTION_CONFIG` and logs a warning so the gap stays
 * visible without failing the caller.
 */
export async function getActiveRecurringDetectionConfig(
  db: Database,
): Promise<RecurringDetectionConfig> {
  const config = await db.query.recurringDetectionConfigs.findFirst({
    where: and(eq(recurringDetectionConfigs.scope, 'global'), eq(recurringDetectionConfigs.active, true)),
  });

  if (!config) {
    getLogger().warn(
      'No active global recurring_detection_configs row found — falling back to @vaya/domain DEFAULT_RECURRING_DETECTION_CONFIG',
    );
    return DEFAULT_RECURRING_DETECTION_CONFIG;
  }

  return {
    minTripCount: config.minTripCount,
    fullConfidenceTripCount: config.fullConfidenceTripCount,
    lookbackDays: config.lookbackDays,
    corridorRadiusMeters: config.corridorRadiusMeters,
    timeWindowMinutes: config.timeWindowMinutes,
    suggestedConfidenceThreshold: config.suggestedConfidenceThreshold,
    dismissalRequiredConfidenceDelta: config.dismissalRequiredConfidenceDelta,
  };
}
