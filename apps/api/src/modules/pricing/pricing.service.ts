import { and, eq } from 'drizzle-orm';
import type { getDatabase } from '../../lib/database.js';
import { pricingConfigs } from '../../db/schema/index.js';
import { DEFAULT_PRICING_CONFIG, type PricingConfigInput } from '@vaya/domain';
import { getLogger } from '../../config/logger.js';
import { MemoryCache } from '../../lib/memory-cache.js';

type Database = ReturnType<typeof getDatabase>;

/**
 * Fetches the active `national`-scope pricing config and maps it onto
 * `@vaya/domain`'s pure `PricingConfigInput` shape. `docs/domain/pricing.md`
 * only defines `national` scope for now (region/route scoping is schema
 * room for later, not implemented).
 *
 * Never throws: ride creation must not be blocked by a missing pricing
 * config row (same "don't block publish" principle the OSRM-fallback edge
 * case follows) — falls back to `@vaya/domain`'s `DEFAULT_PRICING_CONFIG`
 * and logs a warning so the gap is visible without failing the request.
 */
/**
 * The active pricing row is read on every ride creation, price edit and
 * booking — and changes only when someone edits the table by hand (there is
 * no admin write path). Kept in memory for a minute: a rate change takes
 * effect within 60s, with no database round trip in between.
 */
const PRICING_CONFIG_TTL_MS = 60_000;
const pricingConfigCache = new MemoryCache<PricingConfigInput>(1, PRICING_CONFIG_TTL_MS);

/** Drops the cached row — for tests that write `pricing_configs` directly. */
export function clearPricingConfigCache(): void {
  pricingConfigCache.clear();
}

export async function getActivePricingConfig(db: Database): Promise<PricingConfigInput> {
  return pricingConfigCache.getOrLoad('national', () => loadActivePricingConfig(db));
}

async function loadActivePricingConfig(db: Database): Promise<PricingConfigInput> {
  const config = await db.query.pricingConfigs.findFirst({
    where: and(eq(pricingConfigs.scope, 'national'), eq(pricingConfigs.active, true)),
  });

  if (!config) {
    getLogger().warn(
      'No active national pricing_configs row found — falling back to @vaya/domain DEFAULT_PRICING_CONFIG',
    );
    return DEFAULT_PRICING_CONFIG;
  }

  return {
    baseRatePerKm: config.baseRatePerKm,
    timeComponentPerMin: config.timeComponentPerMin,
    minMultiplier: config.minMultiplier,
    maxMultiplier: config.maxMultiplier,
  };
}
