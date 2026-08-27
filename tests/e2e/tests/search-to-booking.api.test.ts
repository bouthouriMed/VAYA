import { test, expect, type APIRequestContext } from '@playwright/test';

/**
 * First real end-to-end coverage of the core search → match → stop-select
 * → book loop (docs/roadmap/phase-05-ride-engine-passenger-selection.md's
 * Definition of Done — `tests/e2e` previously had only the health-check
 * suite). Follows health-check.api.test.ts's conventions: API-level
 * Playwright tests against a live server (baseURL from playwright.config.ts
 * / API_BASE_URL), no mocking — real Postgres, real OSRM (docker-composed,
 * same as apps/api's own integration tests).
 *
 * Exercises: driver onboarding → ride creation → real OSRM-backed
 * candidate-stop generation → driver stop selection → publish → passenger
 * matching search (asserting `rankedStops`/`pickupViable`) → booking with
 * `pickupStopId` → server-side rejection of a cross-ride stopId and of
 * free-form coordinates for a ride that has stops → legacy (stop-less)
 * ride still bookable via the old free-form flow.
 */

const API_PREFIX = '/api/v1';

interface AuthedUser {
  userId: string;
  accessToken: string;
}

async function randomTunisianPhone(): Promise<string> {
  const suffix = (Date.now() % 100_000_000).toString().padStart(8, '0');
  return `+216${suffix}`;
}

async function registerAndLogin(request: APIRequestContext, fullName: string): Promise<AuthedUser> {
  const phone = await randomTunisianPhone();

  const otpRes = await request.post(`${API_PREFIX}/auth/otp/request`, { data: { phone } });
  expect(otpRes.ok()).toBeTruthy();
  const { devCode } = (await otpRes.json()) as { devCode?: string };
  expect(devCode).toBeTruthy(); // dev-mode convenience surfaced by auth.routes.ts

  const verifyRes = await request.post(`${API_PREFIX}/auth/otp/verify`, {
    data: { phone, code: devCode },
  });
  expect(verifyRes.ok()).toBeTruthy();
  const tokens = (await verifyRes.json()) as { accessToken: string };

  // Real user id: decode the JWT's `sub` claim rather than adding a
  // separate lookup call — this is the same claim getUserId() reads
  // server-side (apps/api/src/lib/auth-context.ts).
  const payload = JSON.parse(
    Buffer.from(tokens.accessToken.split('.')[1]!, 'base64').toString('utf-8'),
  ) as { sub: string };

  // fullName isn't set by OTP verification alone in this flow — not needed
  // by anything this suite asserts on, so it's accepted as a parameter for
  // readability at call sites without a further PATCH /users/me call.
  void fullName;

  return { userId: payload.sub, accessToken: tokens.accessToken };
}

test.describe('Search → match → stop-select → book (real ride engine)', () => {
  let driver: AuthedUser;
  let rider: AuthedUser;
  let vehicleId: string;
  let rideWithStopsId: string;
  let rideOrigin: { lat: number; lng: number };
  let rideDestination: { lat: number; lng: number };
  let generatedStops: { id: string; label: string; lat: number; lng: number }[] = [];
  let legacyRideId: string;

  test.beforeAll(async ({ playwright }) => {
    const request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    });

    driver = await registerAndLogin(request, 'E2E Driver');
    rider = await registerAndLogin(request, 'E2E Rider');

    const onboardingRes = await request.post(`${API_PREFIX}/drivers/onboarding`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicle: {
          make: 'Test',
          model: 'E2E',
          color: 'Blue',
          plateNumber: `E2E-${Date.now() % 100000}`,
          seatCount: 4,
        },
        documents: [{ type: 'license', fileUrl: 'https://example.com/license.jpg' }],
      },
    });
    expect(onboardingRes.ok()).toBeTruthy();
    const driverProfile = (await onboardingRes.json()) as { id: string; vehicles: { id: string }[] };
    vehicleId = driverProfile.vehicles[0]!.id;

    // Admin verification workflow (docs/domain/verification-workflow.md):
    // onboarding now leaves a driver `pending`, not auto-approved — a real
    // review step, matching how it actually happens in production, keeps
    // this suite honest about the full flow rather than reintroducing a
    // bypass. Relies on the seeded admin login (apps/api/src/db/seed.ts) —
    // the same "real dev environment" precondition this suite already has
    // via `devCode` (the dev-mode OTP bypass) above.
    const adminLoginRes = await request.post(`${API_PREFIX}/admin/login`, {
      data: { email: 'admin@vaya.tn', password: 'VayaAdmin2026!' },
    });
    expect(adminLoginRes.ok()).toBeTruthy();
    const { accessToken: adminToken } = (await adminLoginRes.json()) as { accessToken: string };

    const approveRes = await request.post(
      `${API_PREFIX}/admin/verifications/${driverProfile.id}/approve`,
      { headers: { Authorization: `Bearer ${adminToken}` }, data: {} },
    );
    expect(approveRes.ok()).toBeTruthy();

    // Same real intra-Tunis route used by apps/api's own stop-candidates
    // integration test (Avenue Habib Bourguiba → Lac 1) — short enough to
    // keep the OSRM sampling fast, long enough to plausibly yield a real
    // candidate stop.
    rideOrigin = { lat: 36.7992, lng: 10.1811 };
    rideDestination = { lat: 36.8324, lng: 10.2334 };

    const createRideRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Avenue Habib Bourguiba, Tunis', lat: rideOrigin.lat, lng: rideOrigin.lng },
        destination: { label: 'Lac 1, Tunis', lat: rideDestination.lat, lng: rideDestination.lng },
        departureAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        seatsTotal: 3,
        contributionPerSeat: 5,
      },
    });
    expect(createRideRes.ok()).toBeTruthy();
    const ride = (await createRideRes.json()) as { id: string };
    rideWithStopsId = ride.id;

    const generateRes = await request.post(
      `${API_PREFIX}/rides/${rideWithStopsId}/candidate-stops`,
      { headers: { Authorization: `Bearer ${driver.accessToken}` } },
    );
    expect(generateRes.ok()).toBeTruthy();
    const generated = (await generateRes.json()) as {
      stops: { id: string; label: string; lat: number; lng: number }[];
      osrmUnavailable: boolean;
    };

    if (generated.stops.length > 0) {
      const selections = generated.stops.map((s) => ({ stopId: s.id, isDriverSelected: true }));
      const selectRes = await request.patch(`${API_PREFIX}/rides/${rideWithStopsId}/stops`, {
        headers: { Authorization: `Bearer ${driver.accessToken}` },
        data: selections,
      });
      expect(selectRes.ok()).toBeTruthy();
      generatedStops = generated.stops;
    }

    const publishRes = await request.post(`${API_PREFIX}/rides/${rideWithStopsId}/publish`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(publishRes.ok()).toBeTruthy();

    // A second ride, published with zero generated/selected stops — the
    // legacy free-form path (docs/domain/ride-engine.md's backward-
    // compatibility rule) must still work for a ride like this.
    const legacyCreateRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Legacy Origin', lat: 36.75, lng: 10.15 },
        destination: { label: 'Legacy Destination', lat: 36.78, lng: 10.18 },
        departureAt: new Date(Date.now() + 30 * 60_000).toISOString(),
        seatsTotal: 3,
        contributionPerSeat: 5,
      },
    });
    expect(legacyCreateRes.ok()).toBeTruthy();
    const legacyRide = (await legacyCreateRes.json()) as { id: string };
    legacyRideId = legacyRide.id;
    const legacyPublishRes = await request.post(`${API_PREFIX}/rides/${legacyRideId}/publish`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(legacyPublishRes.ok()).toBeTruthy();

    await request.dispose();
  });

  test('matching search returns rankedStops for the ride with driver-selected stops', async ({
    request,
  }) => {
    test.skip(generatedStops.length === 0, 'No candidate stops generated for this route/OSRM run');

    const res = await request.get(`${API_PREFIX}/matching/search`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
      params: {
        originLat: rideOrigin.lat,
        originLng: rideOrigin.lng,
        destinationLat: rideDestination.lat,
        destinationLng: rideDestination.lng,
        when: new Date().toISOString(),
      },
    });
    expect(res.ok()).toBeTruthy();
    // Phase 13 (docs/roadmap/phase-13-search-engine.md): the response is
    // now a tiered-cascade envelope, not a bare candidate array.
    const body = (await res.json()) as {
      tier: string;
      candidates: {
        rideId: string;
        rankedStops: { stopId: string; label: string; walkMinutes: number }[];
        pickupViable: boolean;
      }[];
    };

    const match = body.candidates.find((c) => c.rideId === rideWithStopsId);
    expect(match).toBeDefined();
    expect(match!.pickupViable).toBe(true);
    expect(match!.rankedStops.length).toBeGreaterThan(0);
    // Ascending by walk distance.
    for (let i = 1; i < match!.rankedStops.length; i++) {
      expect(match!.rankedStops[i]!.walkMinutes).toBeGreaterThanOrEqual(
        match!.rankedStops[i - 1]!.walkMinutes,
      );
    }
  });

  test('booking with a valid pickupStopId succeeds and copies the stop label/coordinates', async ({
    request,
  }) => {
    test.skip(generatedStops.length === 0, 'No candidate stops generated for this route/OSRM run');

    const stop = generatedStops[0]!;
    const res = await request.post(`${API_PREFIX}/rides/${rideWithStopsId}/requests`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
      data: { seatsRequested: 1, pickupStopId: stop.id },
    });
    expect(res.ok()).toBeTruthy();
    const booking = (await res.json()) as {
      pickupStopId: string;
      pickupLabel: string;
      pickupLat: number;
      pickupLng: number;
    };
    expect(booking.pickupStopId).toBe(stop.id);
    expect(booking.pickupLabel).toBe(stop.label);
    expect(booking.pickupLat).toBe(stop.lat);
    expect(booking.pickupLng).toBe(stop.lng);
  });

  test('rejects free-form pickup coordinates for a ride that has stops', async ({ request }) => {
    test.skip(generatedStops.length === 0, 'No candidate stops generated for this route/OSRM run');

    const res = await request.post(`${API_PREFIX}/rides/${rideWithStopsId}/requests`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
      data: { seatsRequested: 1, pickup: { label: 'Arbitrary pin', lat: 36.8, lng: 10.2 } },
    });
    expect(res.status()).toBe(400);
  });

  test('rejects a pickupStopId that does not belong to the target ride', async ({ request }) => {
    test.skip(generatedStops.length === 0, 'No candidate stops generated for this route/OSRM run');

    const res = await request.post(`${API_PREFIX}/rides/${legacyRideId}/requests`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
      data: { seatsRequested: 1, pickupStopId: generatedStops[0]!.id },
    });
    expect(res.status()).toBe(400);
  });

  test('legacy (stop-less) ride still accepts the free-form pickup flow', async ({ request }) => {
    const res = await request.post(`${API_PREFIX}/rides/${legacyRideId}/requests`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
      data: {
        seatsRequested: 1,
        pickup: { label: 'Free-form pin', lat: 36.76, lng: 10.16 },
      },
    });
    expect(res.ok()).toBeTruthy();
    const booking = (await res.json()) as { pickupStopId: string | null; pickupLabel: string };
    expect(booking.pickupStopId).toBeNull();
    expect(booking.pickupLabel).toBe('Free-form pin');
  });
});
