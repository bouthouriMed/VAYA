import { test, expect } from '@playwright/test';
import { registerAndLogin, adminLogin, onboardAndApproveDriver, requestBooking, acceptBooking, TUNIS, SOUSSE, inMinutes } from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-06 (docs/tdd_journey_test_matrix.md) — spec §20 and the invariant list
 * (§62 "Requests: first accepted request wins for a passenger journey"):
 *
 *   "Passenger may hold up to 3 active requests for the SAME journey...
 *    A 4th request attempt for the same journey is rejected while 3 are
 *    active... First acceptance wins: accepting Driver A confirms it and
 *    auto-cancels/closes all other pending requests for the same journey."
 *
 * What a real passenger should experience: requesting the same trip from
 * three different drivers as a hedge, then having whichever one accepts
 * FIRST automatically resolve the others — never being left with stale
 * "pending" requests to manually clean up, and never able to accidentally
 * end up confirmed with two different drivers for the same journey.
 *
 * Matrix classification: FAIL (missing) — no cross-ride grouping concept
 * exists anywhere (ambiguity log A-5 in docs/tdd_journey_test_matrix.md
 * documents the "same journey" identity question this capability would
 * need to answer first). This journey is expected to fail on both
 * assertions today, for real, over the actual booking-request HTTP flow a
 * passenger's app uses.
 */
test.describe('Journey 6 — three alternative requests for the same journey; first acceptance wins', () => {
  test('a 4th request for the same journey is rejected while 3 are active, and the first acceptance auto-cancels the other pending requests', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });

    const admin = await adminLogin(request);
    const rider = await registerAndLogin(request, 40);

    async function publishCompetingRide(salt: number) {
      const driver = await registerAndLogin(request, salt);
      const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);
      const createRes = await request.post(`${API_PREFIX}/rides`, {
        headers: { Authorization: `Bearer ${driver.accessToken}` },
        data: {
          vehicleId,
          origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
          destination: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
          departureAt: inMinutes(90).toISOString(),
          seatsTotal: 2,
        },
      });
      expect(createRes.ok()).toBeTruthy();
      const ride = (await createRes.json()) as { id: string };
      const publishRes = await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, {
        headers: { Authorization: `Bearer ${driver.accessToken}` },
      });
      expect(publishRes.ok()).toBeTruthy();
      return { driver, rideId: ride.id };
    }

    const rideA = await publishCompetingRide(41);
    const rideB = await publishCompetingRide(42);
    const rideC = await publishCompetingRide(43);
    const rideD = await publishCompetingRide(44);

    async function requestSameJourney(rideId: string) {
      const { res, json } = await requestBooking(request, rider, rideId, {
        seatsRequested: 1,
        pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        dropoff: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
      });
      return { res, json: json as { id: string; status: string } };
    }

    const requestA = await requestSameJourney(rideA.rideId);
    expect(requestA.res.ok(), 'The 1st request for this journey should succeed').toBeTruthy();
    const requestB = await requestSameJourney(rideB.rideId);
    expect(requestB.res.ok(), 'The 2nd request for the same journey should succeed').toBeTruthy();
    const requestC = await requestSameJourney(rideC.rideId);
    expect(requestC.res.ok(), 'The 3rd request for the same journey should succeed').toBeTruthy();

    // M-051/M-052: a 4th active request for the SAME journey must be
    // rejected while 3 are already active.
    const requestD = await requestSameJourney(rideD.rideId);
    expect(
      requestD.res.status(),
      'A 4th active request for the same journey should be rejected (spec §20: max 3 active alternative requests) — today nothing caps this',
    ).toBe(409);

    // M-055/M-056/INV-03: driver B accepts first — A and C's pending
    // requests for the SAME journey should auto-cancel.
    const accepted = await acceptBooking(request, rideB.driver, requestB.json.id);
    expect(accepted.status).toBe('accepted');

    const mineRes = await request.get(`${API_PREFIX}/bookings/mine`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
    });
    expect(mineRes.ok()).toBeTruthy();
    const mine = (await mineRes.json()) as Array<{ id: string; status: string }>;
    const bookingAAfter = mine.find((b) => b.id === requestA.json.id);
    const bookingCAfter = mine.find((b) => b.id === requestC.json.id);

    expect(
      bookingAAfter?.status,
      'Once one alternative is accepted, sibling request A for the same journey should be auto-cancelled, not left pending forever (spec §20/§49)',
    ).not.toBe('pending');
    expect(
      bookingCAfter?.status,
      'Once one alternative is accepted, sibling request C for the same journey should be auto-cancelled, not left pending forever (spec §20/§49)',
    ).not.toBe('pending');

    await request.dispose();
  });
});
