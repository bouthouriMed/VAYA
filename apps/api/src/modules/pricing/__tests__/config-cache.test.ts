import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getActivePricingConfig, clearPricingConfigCache } from '../pricing.service.js';
import {
  getActiveOperationalConfig,
  clearOperationalConfigCache,
} from '../../operational-config/operational-config.service.js';

vi.mock('../../../config/logger.js', () => ({ getLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }));

const pricingRow = { baseRatePerKm: 0.2, timeComponentPerMin: 0.06, minMultiplier: 0.7, maxMultiplier: 1.3 };

function fakeDb() {
  return {
    query: {
      pricingConfigs: { findFirst: vi.fn().mockResolvedValue(pricingRow) },
      operationalConfigs: { findFirst: vi.fn().mockResolvedValue({ maxDetourRatio: 0.3 }) },
    },
  };
}

/**
 * Config rows were read from Postgres on every search fallback and nearly
 * every booking action; they now come from memory for a short TTL.
 */
describe('active config caching', () => {
  beforeEach(() => {
    clearPricingConfigCache();
    clearOperationalConfigCache();
  });

  it('reads the pricing row once, then serves it from memory', async () => {
    const db = fakeDb();
    const first = await getActivePricingConfig(db as never);
    const second = await getActivePricingConfig(db as never);
    expect(second).toEqual(first);
    expect(first.baseRatePerKm).toBe(0.2);
    expect(db.query.pricingConfigs.findFirst).toHaveBeenCalledTimes(1);
  });

  it('reads the operational row once, and again after the cache is cleared (what an admin edit does)', async () => {
    const db = fakeDb();
    await getActiveOperationalConfig(db as never);
    await getActiveOperationalConfig(db as never);
    expect(db.query.operationalConfigs.findFirst).toHaveBeenCalledTimes(1);
    clearOperationalConfigCache();
    const after = await getActiveOperationalConfig(db as never);
    expect(after.maxDetourRatio).toBe(0.3);
    expect(db.query.operationalConfigs.findFirst).toHaveBeenCalledTimes(2);
  });

  it('expires on its own so a change made from another API instance is picked up', async () => {
    vi.useFakeTimers();
    try {
      const db = fakeDb();
      await getActivePricingConfig(db as never);
      vi.advanceTimersByTime(61_000);
      await getActivePricingConfig(db as never);
      expect(db.query.pricingConfigs.findFirst).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
