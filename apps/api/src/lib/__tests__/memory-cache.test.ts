import { describe, it, expect, vi, afterEach } from 'vitest';
import { MemoryCache } from '../memory-cache.js';

afterEach(() => {
  vi.useRealTimers();
});

describe('MemoryCache', () => {
  it('returns a stored value until its TTL expires', () => {
    vi.useFakeTimers();
    const cache = new MemoryCache<number>(10, 1000);
    cache.set('a', 1);
    expect(cache.get('a')).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(cache.get('a')).toBeUndefined();
  });

  it('evicts the least recently used entry past its size cap', () => {
    const cache = new MemoryCache<number>(2, 60_000);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // "a" is now more recent than "b"
    cache.set('c', 3);
    expect(cache.get('b')).toBeUndefined();
    expect(cache.get('a')).toBe(1);
    expect(cache.get('c')).toBe(3);
  });

  it('coalesces concurrent loads of the same key into one computation', async () => {
    const cache = new MemoryCache<string>(10, 60_000);
    let resolve!: (value: string) => void;
    const load = vi.fn(() => new Promise<string>((r) => (resolve = r)));
    const first = cache.getOrLoad('route', load);
    const second = cache.getOrLoad('route', load);
    resolve('value');
    await expect(Promise.all([first, second])).resolves.toEqual(['value', 'value']);
    expect(load).toHaveBeenCalledTimes(1);
    await expect(cache.getOrLoad('route', load)).resolves.toBe('value');
    expect(load).toHaveBeenCalledTimes(1);
  });

  it('never caches a failed load, and honours a per-value TTL (0 = do not cache)', async () => {
    const cache = new MemoryCache<string>(10, 60_000);
    await expect(cache.getOrLoad('k', () => Promise.reject(new Error('down')))).rejects.toThrow('down');
    await expect(cache.getOrLoad('k', async () => 'ok', () => 0)).resolves.toBe('ok');
    expect(cache.get('k')).toBeUndefined();
  });
});
