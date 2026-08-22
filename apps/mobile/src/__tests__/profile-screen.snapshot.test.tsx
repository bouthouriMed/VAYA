import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { renderJSON } from './test-utils/renderJSON';
import type { DriverProfile, Me } from '../state/api';

/**
 * Real react-test-renderer snapshots of (tabs)/profile.tsx — pins the
 * driver block being *reactive to verification status* (the hub must never
 * show the "Partagez vos trajets" recruitment pitch to someone who already
 * drives): loading skeleton → recruitment pitch → pending → rejected →
 * verified card with the real vehicle + trip stats.
 *
 * `vi.doMock` + `resetModules` per case so each render sees its own query
 * results. expo-secure-store is never touched: the two service modules that
 * wrap it are mocked outright, and expo-image-picker gets an inert stub.
 */

const ME: Me = {
  id: 'u-1',
  fullName: 'Salma Trabelsi',
  avatarUrl: null,
  phone: '+21698123456',
  email: null,
  authProvider: 'phone',
  locale: 'fr',
  createdAt: '2026-01-15T09:00:00',
  updatedAt: '2026-01-15T09:00:00',
};

const TRUST_SUMMARY = {
  rider: { tier: 'new', ratingAvg: null, tripCount: 2 },
  driver: null as null | { tier: string; ratingAvg: number | null; tripCount: number },
};

function makeDriverProfile(
  overrides: Partial<DriverProfile> = {},
): DriverProfile {
  return {
    id: 'dp-1',
    userId: 'u-1',
    verificationStatus: 'approved',
    bio: null,
    ratingAvg: 4.8,
    tripCount: 12,
    punctualityScore: 96,
    reliabilityScore: 94,
    approvedAt: '2026-08-22T10:00:00',
    vehicles: [
      {
        id: 'veh-1',
        driverProfileId: 'dp-1',
        make: 'Dacia',
        model: 'Logan',
        color: 'Blanc',
        plateNumber: '123 TU 4567',
        seatCount: 4,
        photoUrl: null,
      },
    ],
    documents: [],
    ...overrides,
  };
}

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), replace: vi.fn(), back: vi.fn(), canGoBack: vi.fn(() => false) },
  Redirect: () => null,
}));

vi.mock('expo-image-picker', () => ({
  requestMediaLibraryPermissionsAsync: async () => ({ granted: false }),
  launchImageLibraryAsync: async () => ({ canceled: true }),
}));

vi.mock('../services/auth/tokenStorage', () => ({
  clearTokens: async () => {},
  getAccessToken: async () => null,
  getRefreshToken: async () => null,
  saveTokens: async () => {},
}));

vi.mock('../services/settings/appearanceStorage', () => ({
  saveAppearancePreference: async () => {},
  loadAppearancePreference: async () => 'system' as const,
}));

function mockApi({
  me = ME,
  trustSummary = TRUST_SUMMARY,
  driverProfile,
  isDriverProfileLoading = false,
}: {
  me?: Me;
  trustSummary?: typeof TRUST_SUMMARY;
  driverProfile?: DriverProfile | null;
  isDriverProfileLoading?: boolean;
}): void {
  vi.doMock('../state/api', () => ({
    // store.ts imports the RTK Query api singleton for reducer/middleware.
    // middleware must be a real 3-level-curried Redux middleware
    // (storeApi => next => action => ...), not a 2-level stub — a shorter
    // shape silently corrupts the whole chain the moment anything actually
    // dispatches through it (harmless while nothing did; this test now does).
    api: {
      reducerPath: 'api',
      reducer: () => ({}),
      middleware: () => (next: (action: unknown) => unknown) => (action: unknown) => next(action),
    },
    useGetMeQuery: () => ({ data: me, isLoading: false }),
    useGetUserTrustSummaryQuery: () => ({ data: trustSummary, isLoading: false }),
    useGetMyDriverProfileQuery: () => ({
      data: isDriverProfileLoading ? undefined : driverProfile ?? undefined,
      isLoading: isDriverProfileLoading,
    }),
    useLogoutMutation: () => [vi.fn(), { isLoading: false }],
    useUpdateMeMutation: () => [vi.fn(), { isLoading: false }],
    useUploadFileMutation: () => [
      () => ({ unwrap: async () => ({ url: 'https://example.com/f.jpg' }) }),
      { isLoading: false },
    ],
    useRequestPhoneOtpMutation: () => [vi.fn(), { isLoading: false }],
    useVerifyPhoneOtpMutation: () => [vi.fn(), { isLoading: false }],
  }));
}

async function renderProfile(): Promise<ReturnType<typeof renderJSON>> {
  vi.resetModules();
  // The hub reads Redux directly (appearance preference, auth token), so
  // render inside the real store — built against the same mocked api module.
  const [{ default: ProfileScreen }, { store }, { ToastProvider }, { setTokens }] = await Promise.all([
    import('../../app/(tabs)/profile'),
    import('../state/store'),
    import('@vaya/design-system'),
    import('../state/authSlice'),
  ]);
  // profile.tsx guards itself behind accessToken (nothing here is
  // meaningful for a guest) — these snapshots exercise the signed-in
  // experience, so the store needs a real token to get past the guard.
  store.dispatch(setTokens({ accessToken: 'test-token', refreshToken: 'test-refresh' }));
  return renderJSON(
    <Provider store={store}>
      <ToastProvider>
        <ProfileScreen />
      </ToastProvider>
    </Provider>,
  );
}

describe('profile.tsx snapshots — driver block vs verification status', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('loading — skeleton card while the driver profile fetch resolves', async () => {
    mockApi({ isDriverProfileLoading: true });
    expect(await renderProfile()).toMatchSnapshot();
  });

  it('no profile — recruitment pitch ("Partagez vos trajets")', async () => {
    mockApi({ driverProfile: null });
    expect(await renderProfile()).toMatchSnapshot();
  });

  it('approved — verified card with real vehicle plate + trip stats', async () => {
    mockApi({
      driverProfile: makeDriverProfile(),
      trustSummary: { rider: TRUST_SUMMARY.rider, driver: { tier: 'trusted', ratingAvg: 4.8, tripCount: 12 } },
    });
    expect(await renderProfile()).toMatchSnapshot();
  });

  it('pending — in-progress status, not tappable, no recruitment pitch', async () => {
    mockApi({ driverProfile: makeDriverProfile({ verificationStatus: 'pending' }) });
    expect(await renderProfile()).toMatchSnapshot();
  });

  it('rejected — refusal status with retry affordance', async () => {
    mockApi({ driverProfile: makeDriverProfile({ verificationStatus: 'rejected' }) });
    expect(await renderProfile()).toMatchSnapshot();
  });
});
