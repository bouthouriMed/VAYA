/**
 * Small in-process cache: TTL + a size cap (least-recently-used eviction),
 * plus request coalescing — concurrent callers asking for the same missing
 * key share ONE underlying computation instead of each running it (e.g.
 * several searches for the same corridor arriving together each calling
 * the routing provider).
 *
 * It is the first cache tier: a hit costs no network round trip at all.
 * lib/cache.ts (Redis) remains the shared second tier across API instances
 * and restarts. Use this tier only for small, hot, rarely-changing values —
 * config rows, recently computed routes — never for per-user or
 * correctness-critical state (seats, bookings, prices shown at booking).
 */
export class MemoryCache<T> {
  private readonly entries = new Map<string, { value: T; expiresAt: number }>();
  private readonly inFlight = new Map<string, Promise<T>>();

  constructor(
    private readonly maxEntries: number,
    private readonly ttlMs: number,
  ) {}

  get(key: string): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= Date.now()) {
      this.entries.delete(key);
      return undefined;
    }
    // Refresh recency: Map iteration order is insertion order, so
    // re-inserting moves the key to the "most recently used" end.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, ttlMs: number = this.ttlMs): void {
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: Date.now() + ttlMs });
    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next().value;
      if (oldest === undefined) break;
      this.entries.delete(oldest);
    }
  }

  delete(key: string): void {
    this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
    this.inFlight.clear();
  }

  /**
   * Cached value for `key`, or the result of `load()` — run at most once
   * at a time per key. `ttlFor` lets the caller pick a TTL from the value
   * (e.g. a short one for a degraded fallback result); returning 0 skips
   * caching that value. A rejected `load()` is never cached.
   */
  async getOrLoad(key: string, load: () => Promise<T>, ttlFor?: (value: T) => number): Promise<T> {
    const hit = this.get(key);
    if (hit !== undefined) return hit;

    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const promise = (async () => {
      try {
        const value = await load();
        const ttlMs = ttlFor ? ttlFor(value) : this.ttlMs;
        if (ttlMs > 0) this.set(key, value, ttlMs);
        return value;
      } finally {
        this.inFlight.delete(key);
      }
    })();
    this.inFlight.set(key, promise);
    return promise;
  }

  get size(): number {
    return this.entries.size;
  }
}
