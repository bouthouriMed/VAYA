import { beforeEach, describe, expect, it, vi } from 'vitest';
import reducer, { hydrateAppearance, setAppearance } from '../state/appearanceSlice';
import {
  loadAppearancePreference,
  saveAppearancePreference,
} from '../services/settings/appearanceStorage';

// In-memory SecureStore stand-in — the real module needs a native runtime.
const secureStore = new Map<string, string>();

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async (key: string) => secureStore.get(key) ?? null),
  setItemAsync: vi.fn(async (key: string, value: string) => {
    secureStore.set(key, value);
  }),
  deleteItemAsync: vi.fn(async (key: string) => {
    secureStore.delete(key);
  }),
}));

describe('appearanceSlice', () => {
  it("defaults to following the system ('system')", () => {
    expect(reducer(undefined, { type: '@@INIT' })).toEqual({ preference: 'system' });
  });

  it('applies an explicit pick', () => {
    expect(reducer({ preference: 'system' }, setAppearance('dark'))).toEqual({
      preference: 'dark',
    });
  });

  it('hydrates the persisted value on startup', () => {
    expect(reducer({ preference: 'system' }, hydrateAppearance('light'))).toEqual({
      preference: 'light',
    });
  });
});

describe('appearanceStorage', () => {
  beforeEach(() => {
    secureStore.clear();
  });

  it("falls back to 'system' when nothing is persisted", async () => {
    await expect(loadAppearancePreference()).resolves.toBe('system');
  });

  it('round-trips a saved preference', async () => {
    await saveAppearancePreference('dark');
    await expect(loadAppearancePreference()).resolves.toBe('dark');
  });

  it("treats an unrecognized stored value as 'system'", async () => {
    secureStore.set('vaya.appearance', 'midnight-blue');
    await expect(loadAppearancePreference()).resolves.toBe('system');
  });
});
