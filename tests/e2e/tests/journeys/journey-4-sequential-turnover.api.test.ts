import { test, expect } from '@playwright/test';
import { registerAndLogin, adminLogin, onboardAndApproveDriver, requestBooking, acceptBooking, TUNIS, HAMMAMET, MONASTIR, inMinutes } from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-04 (docs/tdd_journey_test_matrix.md) — spec §26 "Continuous Matching /
 * Turnover":
 *
 *   "pick up passenger A in Madrid, drop passenger A in Zaragoza, pick up
 *    passenger B in Zaragoza, continue... The system should continuously
 *    search for new feasible requests while seats are available."
 *
 * What a real driver with only ONE physical seat should experience: they
 * can still carry passenger A for the first leg and passenger B for a
 * later, non-overlapping leg of the SAME ride — a single seat isn't wasted
 * for the whole trip just because it's briefly occupied on one sub-segment.
 *
 * Matrix classification: PASS (capacity) — this journey re-proves the
 * already-correct segment-aware capacity mechanism
 * (`bookings.service.ts`'s `recomputeAndPersistRideCapacity`, already unit-
 * proven by `bookings-segment-capacity.integration.test.ts`) over the real
 * HTTP booking-request flow two independent passengers actually use.
 */
test.describe('Journey 4 — sequential turnover on a single-seat ride', () => {
  test('a second passenger can book a later, non-overlapping segment of a ride whose only seat is already taken on an earlier segment', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });

    const driver = await registerAndLogin(request, 80);
    const riderA = await registerAndLogin(request, 81);
    const riderB = await registerAndLogin(request, 82);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin, { seatCount: 1 });

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        destination: { label: 'Monastir', lat: MONASTIR.lat, lng: MONASTIR.lng },
        departureAt: inMinutes(60).toISOString(),
        seatsTotal: 1, // a single physical seat — the whole point of this journey
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const ride = (await createRes.json()) as { id: string };

    const hammametStopRes = await request.post(`${API_PREFIX}/rides/${ride.id}/stops/custom`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: { label: 'Hammamet', lat: HAMMAMET.lat, lng: HAMMAMET.lng, role: 'via' },
    });
    expect(hammametStopRes.ok()).toBeTruthy();
    const hammametStop = (await hammametStopRes.json()) as { id: string };

    await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, { headers: { Authorization: `Bearer ${driver.accessToken}` } });

    // Passenger A takes the one seat for the FIRST leg: Tunis -> Hammamet.
    const { res: bookARes, json: bookingA } = await requestBooking(request, riderA, ride.id, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      dropoffStopId: hammametStop.id,
    });
    expect(bookARes.ok(), 'Passenger A booking the first leg should succeed').toBeTruthy();
    const acceptedA = await acceptBooking(request, driver, (bookingA as { id: string }).id);
    expect(acceptedA.status).toBe('accepted');

    // Passenger B should STILL be able to book the LATER, non-overlapping
    // leg — Hammamet -> Monastir — on the very same single-seat ride, while
    // A's booking is still active.
    const { res: bookBRes, json: bookingB } = await requestBooking(request, riderB, ride.id, {
      seatsRequested: 1,
      pickupStopId: hammametStop.id,
      dropoff: { label: 'Monastir', lat: MONASTIR.lat, lng: MONASTIR.lng },
    });
    expect(
      bookBRes.ok(),
      'A single-seat ride should still accept a second passenger on a later, non-overlapping segment (spec §26 turnover) — a global "no seats left" check would wrongly reject this',
    ).toBeTruthy();
    const acceptedB = await acceptBooking(request, driver, (bookingB as { id: string }).id);
    expect(acceptedB.status).toBe('accepted');

    await request.dispose();
  });
});
