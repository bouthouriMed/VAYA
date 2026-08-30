import { test, expect } from '@playwright/test';
import { registerAndLogin, adminLogin, onboardAndApproveDriver, requestBooking, acceptBooking, cancelBooking, TUNIS, SOUSSE, inMinutes } from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-07 (docs/tdd_journey_test_matrix.md) — spec §38 "Cancellation" and
 * §46 "Edge Case: Driver Cancels Before Trip":
 *
 *   "Before trip start: driver can cancel, passenger can cancel. Both use
 *    the same v1 mechanics. A lightweight reason is required." /
 *    "Driver cancels before trip: bookings closed, seats released, matching
 *    stopped, passengers notified, search eligibility updated, history
 *    preserved, stale requests unacceptable after."
 *
 * Two real user experiences under test:
 *  (a) A passenger cancelling a confirmed booking should be asked for (and
 *      the system should require) a reason — not a silent, reason-less
 *      cancel.
 *  (b) A driver cancelling their whole ride should leave no orphaned,
 *      still-"accepted"-looking booking behind for the passenger who was
 *      counting on it.
 *
 * Matrix note: M-110 was previously classified PASS ("reason required from
 * a fixed set") based on the mobile `CancellationSheet` UI presenting a
 * fixed reason picker. Confirmed live THIS session by reading
 * `bookings.routes.ts`'s `POST /bookings/:bookingId/cancel` schema and
 * `bookings.service.ts`'s `cancelBooking` signature directly: there is no
 * request body schema at all, and `cancelBooking(db, bookingId, userId)`
 * takes no reason parameter — nothing server-side ever requires, receives,
 * or stores a cancellation reason. The mobile reason picker is real UI, but
 * it is decorative: nothing transmits it. This test corrects that stale
 * classification by demonstrating it over the real HTTP endpoint rather
 * than continuing to assume the matrix's prior audit was right.
 */
test.describe('Journey 7 — cancellation (passenger, and driver cancelling the whole ride)', () => {
  test('cancelling a booking without a reason should be rejected — a reason should be required, per spec', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });

    const driver = await registerAndLogin(request, 50);
    const rider = await registerAndLogin(request, 51);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        destination: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
        // Well over 24h out — the "free" cancellation tier, so this test
        // isolates the reason requirement from the separate penalty-tier
        // logic (already covered by packages/domain's own passing
        // cancellation-policy contract tests).
        departureAt: inMinutes(60 * 48).toISOString(),
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

    // No reason supplied — per spec §38 this should be rejected outright.
    const cancelRes = await cancelBooking(request, rider, bookingJson.id);
    expect(
      cancelRes.status(),
      'A cancellation with no reason should be rejected (spec §38: "a lightweight reason is required") — today the endpoint accepts no reason field at all and cancels unconditionally',
    ).toBe(400);

    await request.dispose();
  });

  test("a driver cancelling their whole ride leaves no orphaned 'accepted'-looking booking behind for the passenger", async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });

    const driver = await registerAndLogin(request, 52);
    const rider = await registerAndLogin(request, 53);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        destination: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
        departureAt: inMinutes(60 * 48).toISOString(),
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

    const rideCancelRes = await request.post(`${API_PREFIX}/rides/${ride.id}/cancel`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(rideCancelRes.ok(), 'The driver should be able to cancel their own ride').toBeTruthy();

    const mineRes = await request.get(`${API_PREFIX}/bookings/mine`, { headers: { Authorization: `Bearer ${rider.accessToken}` } });
    expect(mineRes.ok()).toBeTruthy();
    const mine = (await mineRes.json()) as Array<{ id: string; status: string }>;
    const bookingAfter = mine.find((b) => b.id === bookingJson.id);

    expect(
      bookingAfter?.status,
      "A booking on a ride the driver just cancelled must not still read 'accepted' (spec §46: bookings closed, passengers notified) — today cancelRide never touches any booking at all",
    ).not.toBe('accepted');

    await request.dispose();
  });
});
