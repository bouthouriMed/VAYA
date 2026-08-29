import { test, expect } from '@playwright/test';
import { registerAndLogin, adminLogin, onboardAndApproveDriver, acceptBooking, requestBooking, TUNIS, HAMMAMET, MONASTIR, inMinutes } from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-03 (docs/tdd_journey_test_matrix.md) — the mirror of Journey 2 at the
 * OTHER end of the ride: a passenger who boards at the ride's real origin
 * but exits early, well before the driver's own destination. What a real
 * early-segment passenger should experience: they should not pay for
 * kilometers the driver is driving without them.
 *
 * Matrix classification: FAIL (pricing) — same root cause as V-02.
 */
test.describe('Journey 3 — early-segment passenger (boards at origin, exits before the destination)', () => {
  test('a passenger who exits well before the destination pays less than the full-route price', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });

    const driver = await registerAndLogin(request, 20);
    const rider = await registerAndLogin(request, 21);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        destination: { label: 'Monastir', lat: MONASTIR.lat, lng: MONASTIR.lng },
        departureAt: inMinutes(60).toISOString(),
        seatsTotal: 4,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const ride = (await createRes.json()) as { id: string };

    const stopRes = await request.post(`${API_PREFIX}/rides/${ride.id}/stops/custom`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: { label: 'Hammamet', lat: HAMMAMET.lat, lng: HAMMAMET.lng, role: 'via' },
    });
    expect(stopRes.ok()).toBeTruthy();
    const hammametStop = (await stopRes.json()) as { id: string };

    const publishRes = await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(publishRes.ok()).toBeTruthy();
    const published = (await publishRes.json()) as { id: string; contributionPerSeat: number };

    // Passenger boards at the ride's real origin (Tunis, free-form — it's
    // the ride's own endpoint, not a driver-selected stop) and exits early
    // at the Hammamet stop.
    const { res: bookRes, json: booking } = await requestBooking(request, rider, published.id, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      dropoffStopId: hammametStop.id,
    });
    expect(bookRes.ok(), 'Booking the origin -> Hammamet leg should succeed').toBeTruthy();
    const bookingJson = booking as { id: string; contributionTotal: number };
    await acceptBooking(request, driver, bookingJson.id);

    const fullRoutePrice = published.contributionPerSeat;
    expect(
      bookingJson.contributionTotal,
      `An early-exiting passenger should pay less than the full Tunis->Monastir price (${fullRoutePrice} DT) for only riding to Hammamet`,
    ).toBeLessThan(fullRoutePrice);

    await request.dispose();
  });
});
