import { test, expect } from '@playwright/test';
import { registerAndLogin, adminLogin, onboardAndApproveDriver, requestBooking, TUNIS, SOUSSE, inMinutes } from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-10 (docs/tdd_journey_test_matrix.md) — spec §62 invariant INV-02/EDGE-049:
 * "No route segment ever exceeds physical vehicle capacity" / "atomic under
 * concurrency". `bookings-segment-capacity.integration.test.ts` already
 * proves this at the bare service-function layer; this journey re-proves it
 * through the REAL thing two drivers racing to tap "Accept" at the same
 * moment actually experience — two concurrent HTTP accept calls against the
 * live Fastify server, not two concurrent calls to `acceptBooking()`
 * in-process. What a real driver should experience: if two requests
 * together would exceed the ride's capacity, accepting both is never
 * possible — exactly one of the two "Accept" taps wins, the other gets a
 * clear, real error, and the ride is never left oversold.
 */
test.describe('Journey 10 — capacity race under real concurrent HTTP requests', () => {
  test('only one of two simultaneous accept requests for a would-overflow ride wins', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });

    const driver = await registerAndLogin(request, 90);
    const riderX = await registerAndLogin(request, 91);
    const riderY = await registerAndLogin(request, 92);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin, { seatCount: 2 });

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        destination: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
        departureAt: inMinutes(60).toISOString(),
        seatsTotal: 2,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const ride = (await createRes.json()) as { id: string };
    await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, { headers: { Authorization: `Bearer ${driver.accessToken}` } });

    // Both riders request the ride's entire 2-seat capacity for the exact
    // same segment — together they'd need 4 seats on a 2-seat ride, so at
    // most one of them can ever legitimately be accepted.
    const { res: bookXRes, json: bookingX } = await requestBooking(request, riderX, ride.id, {
      seatsRequested: 2,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      dropoff: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
    });
    expect(bookXRes.ok()).toBeTruthy();
    const { res: bookYRes, json: bookingY } = await requestBooking(request, riderY, ride.id, {
      seatsRequested: 2,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      dropoff: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
    });
    expect(bookYRes.ok()).toBeTruthy();

    const [acceptXRes, acceptYRes] = await Promise.all([
      request.post(`${API_PREFIX}/bookings/${(bookingX as { id: string }).id}/accept`, { headers: { Authorization: `Bearer ${driver.accessToken}` } }),
      request.post(`${API_PREFIX}/bookings/${(bookingY as { id: string }).id}/accept`, { headers: { Authorization: `Bearer ${driver.accessToken}` } }),
    ]);

    const okCount = [acceptXRes, acceptYRes].filter((r) => r.ok()).length;
    expect(
      okCount,
      'Exactly one of two simultaneous over-capacity accept requests should succeed, never both and never zero',
    ).toBe(1);
    const failedRes = acceptXRes.ok() ? acceptYRes : acceptXRes;
    expect(failedRes.status()).toBe(409);

    await request.dispose();
  });
});
