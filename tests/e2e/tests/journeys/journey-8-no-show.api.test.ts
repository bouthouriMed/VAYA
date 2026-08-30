import { test, expect } from '@playwright/test';
import { registerAndLogin, adminLogin, onboardAndApproveDriver, requestBooking, acceptBooking, reportNoShow, TUNIS, SOUSSE } from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-08 (docs/tdd_journey_test_matrix.md) — spec §37 "No-Show":
 *
 *   "No-show should be contextual. A passenger sitting at home should not
 *    simply be able to report: Driver is a no-show. The action becomes
 *    relevant around: scheduled pickup time, pickup location,
 *    driver/passenger physical proximity, expected arrival window. Either
 *    party can report a no-show."
 *
 * Two real experiences under test:
 *  (a) Reporting immediately after departure, with no time for anyone to
 *      have genuinely failed to show up, should be rejected.
 *  (b) Once enough time has genuinely passed, a real report should succeed
 *      and should carry a real consequence for the reported party (an
 *      automatic low rating), not just flip a status flag.
 *
 * Matrix note: (b) and "either party can report" are already correct today
 * (M-103, INV-05-adjacent) — this journey re-proves that over the real HTTP
 * endpoint. The location/proximity half of §37 ("a passenger sitting at
 * home should not simply be able to report") is a REAL, separate gap
 * (M-102) that this journey does not attempt to assert on: confirmed this
 * session that `POST /bookings/:bookingId/report-no-show` accepts no
 * location/proximity data in its request body at all (bookings.routes.ts),
 * so there is no way to even express "report from the wrong place" through
 * today's API surface — the gap is the missing input, not a wrong decision
 * on a given input. See docs/tdd_journey_test_report.md for that finding.
 */
test.describe('Journey 8 — no-show reporting', () => {
  async function setUpAcceptedBookingWithDeparture(playwright: any, salt: number, departureAt: Date) {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });
    const driver = await registerAndLogin(request, salt);
    const rider = await registerAndLogin(request, salt + 1);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        destination: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
        departureAt: departureAt.toISOString(),
        seatsTotal: 2,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const ride = (await createRes.json()) as { id: string };
    await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, { headers: { Authorization: `Bearer ${driver.accessToken}` } });

    const { res: bookRes, json: booking } = await requestBooking(request, rider, ride.id, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      dropoff: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
    });
    expect(bookRes.ok()).toBeTruthy();
    const bookingJson = booking as { id: string };
    await acceptBooking(request, driver, bookingJson.id);

    return { request, driver, rider, bookingId: bookingJson.id };
  }

  test('reporting a no-show immediately after departure (no real grace period) is rejected', async ({ playwright }) => {
    const departureAt = new Date(Date.now() - 5 * 60_000); // departed 5 minutes ago
    const { request, rider, bookingId } = await setUpAcceptedBookingWithDeparture(playwright, 70, departureAt);

    const res = await reportNoShow(request, rider, bookingId);
    expect(
      res.status(),
      'A no-show reported only 5 minutes after departure should be rejected as premature (spec §37 grace period)',
    ).toBe(409);

    await request.dispose();
  });

  test('a genuine no-show reported after the grace period succeeds and applies a real consequence to the reported party', async ({ playwright }) => {
    const departureAt = new Date(Date.now() - 20 * 60_000); // departed 20 minutes ago
    const { request, driver, rider, bookingId } = await setUpAcceptedBookingWithDeparture(playwright, 72, departureAt);

    // The rider reports the DRIVER as a no-show.
    const res = await reportNoShow(request, rider, bookingId);
    expect(res.ok(), 'A no-show reported after the real grace period should succeed').toBeTruthy();
    const booking = (await res.json()) as { status: string };
    expect(booking.status).toBe('no_show');

    // A real consequence: the reported party (the driver) gets an
    // automatic low rating, reflected in their real public trust summary.
    const trustRes = await request.get(`${API_PREFIX}/users/${driver.userId}/trust-summary`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
    });
    expect(trustRes.ok()).toBeTruthy();
    const trust = (await trustRes.json()) as { driver: { ratingAvg: number; tripCount: number } | null };
    expect(trust.driver, 'A no-show should leave a real trace in the reported driver\'s public trust summary').not.toBeNull();

    await request.dispose();
  });
});
