import { describe, it, expect, vi } from 'vitest';
import { STABLE_DATA_DEFAULTS, withStableDataDefaults } from '../stableData';

describe('withStableDataDefaults', () => {
  it('applies the stable-data defaults: no refetch on every mount or app foreground', () => {
    const hook = vi.fn((_arg: string, options?: object) => options);
    expect(withStableDataDefaults(hook)('user-1')).toEqual(STABLE_DATA_DEFAULTS);
    expect(STABLE_DATA_DEFAULTS).toEqual({ refetchOnMountOrArgChange: 300, refetchOnFocus: false });
  });

  it("keeps the caller's own options, which win over the defaults", () => {
    const hook = vi.fn((_arg: string, options?: { skip?: boolean; refetchOnFocus?: boolean }) => options);
    expect(withStableDataDefaults(hook)('user-1', { skip: true, refetchOnFocus: true })).toEqual({
      refetchOnMountOrArgChange: 300,
      refetchOnFocus: true,
      skip: true,
    });
  });
});
