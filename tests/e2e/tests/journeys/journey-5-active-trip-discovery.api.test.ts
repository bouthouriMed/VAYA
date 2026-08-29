import { test, expect } from '@playwright/test';
import {
  registerAndLogin,
  adminLogin,
  onboardAndApproveDriver,
  requestBooking,
  acceptBooking,
  getTripForBooking,
  startTrip,
  updateTripLocation,
  searchRidesAsRider,
  TUNIS,
  HAMMAMET,
  SOUSSE,
  MONASTIR,
  inMinutes,
} from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-05 (docs/tdd_journey_test_matrix.md) — spec §30 "In-Progress Matching",
 * the audit's own P0 finding:
 *
 *   "Driver: Madrid -> Barcelona has already left Madrid. While approaching
 *    Zaragoza: Passenger searches Zaragoza -> Barcelona. VAYA should
 *    evaluate the request against the driver's current position and
 *    remaining journey... If feasible, the passenger can receive the trip."
 *
 * What a real passenger should experience: a driver who is already
 * en route and genuinely still has a feasible remaining corridor ahead of
 * them should still be a real, bookable search result — not invisible just
 * because their trip already started.
 *
 * Confirmed live, this session: `startTrip` (trips.service.ts) calls
 * `syncRideStatusOnTripStart`, which sets `rides.status = 'in_progress'`;
 * every tier in `searchRides` (matching.service.ts) filters strictly on
 * `eq(rides.status, 'published')`. The consequence verified end-to-end
 * below: the instant a trip starts, the ride vanishes from search entirely,
 * with zero regard for how much of the route is still genuinely ahead of
 * the driver. This test is expected to FAIL today — that failure IS the
 * verification that this real, user-facing gap exists, exercised through
 * the actual HTTP API a passenger's app calls, not inferred from reading
 * the code alone.
 */
test.describe('Journey 5 — active-trip discovery (driver already en route, remaining corridor still feasible)', () => {
  test('a driver who has started their trip and genuinely still has a feasible remaining corridor stays discoverable for that remaining leg', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });

    const driver = await registerAndLogin(request, 30);
    const firstRider = await registerAndLogin(request, 31);
    const secondRider = await registerAndLogin(request, 32);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        destination: { label: 'Monastir', lat: MONASTIR.lat, lng: MONASTIR.lng },
        departureAt: inMinutes(10).toISOString(),
        seatsTotal: 4,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const ride = (await createRes.json()) as { id: string };

    const sousseStopRes = await request.post(`${API_PREFIX}/rides/${ride.id}/stops/custom`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng, role: 'via' },
    });
    expect(sousseStopRes.ok()).toBeTruthy();
    const sousseStop = (await sousseStopRes.json()) as { id: string };

    const publishRes = await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(publishRes.ok()).toBeTruthy();
    const published = (await publishRes.json()) as { id: string };

    // A first passenger books the origin leg so a real trip exists to start.
    const { res: firstBookRes, json: firstBooking } = await requestBooking(request, firstRider, published.id, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      dropoffStopId: sousseStop.id,
    });
    expect(firstBookRes.ok()).toBeTruthy();
    const firstBookingJson = firstBooking as { id: string };
    const accepted = await acceptBooking(request, driver, firstBookingJson.id);

    // The driver genuinely starts the trip and reports a real position
    // already past Hammamet, approaching Sousse — Monastir is still
    // genuinely ahead of them.
    const trip = await getTripForBooking(request, driver, accepted.id);
    const startRes = await startTrip(request, driver, trip.id);
    expect(startRes.ok(), 'The driver should be able to start their trip').toBeTruthy();

    const locationRes = await updateTripLocation(request, driver, trip.id, HAMMAMET);
    expect(locationRes.ok(), 'The driver should be able to report their live position').toBeTruthy();

    // A second passenger now searches for the remaining leg — Sousse ->
    // Monastir — which is genuinely still ahead of the driver's current
    // position. Per spec §30, this should be a real, feasible match.
    const searchResult = await searchRidesAsRider(request, secondRider, { origin: SOUSSE, destination: MONASTIR });
    const match = searchResult.candidates.find((c) => c.rideId === published.id);
    expect(
      match,
      'An in-progress ride with a genuinely feasible remaining corridor ahead of the driver should still be discoverable for that remaining leg (spec §30) — today it disappears from search entirely the instant the trip starts',
    ).toBeDefined();

    await request.dispose();
  });
});
