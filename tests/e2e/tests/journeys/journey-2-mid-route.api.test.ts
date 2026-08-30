import { test, expect } from '@playwright/test';
import {
  registerAndLogin,
  adminLogin,
  onboardAndApproveDriver,
  createAndPublishRide,
  requestBooking,
  acceptBooking,
  searchRidesAsRider,
  TUNIS,
  HAMMAMET,
  SOUSSE,
  MONASTIR,
  inMinutes,
} from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-02 (docs/tdd_journey_test_matrix.md) — spec §24's own worked example:
 * "Driver publishes Madrid -> Barcelona = EUR20. Passenger requests
 * Zaragoza -> Barcelona. VAYA calculates a segment price, e.g. EUR10." Here:
 * a driver publishes Tunis -> Monastir with real intermediate stops at
 * Hammamet and Sousse, and a passenger requests the strict sub-segment
 * Hammamet -> Sousse — never touching the ride's own origin or destination.
 *
 * What a real mid-route passenger should experience:
 *  - They can find and book a sub-segment of a longer ride.
 *  - What they pay reflects THEIR segment, not the driver's full-route price.
 *
 * Matrix classification: FAIL (pricing wrong; matching/booking mechanics
 * otherwise correct) — `bookings.service.ts`'s `createBooking` computes
 * `contributionTotal: ride.contributionPerSeat * seatsRequested`
 * unconditionally (confirmed live, ~L493), with no segment-distance
 * adjustment at all. This test is expected to demonstrate that gap for
 * real, over the actual HTTP API a mobile passenger's app calls — not to
 * newly invent it.
 */
test.describe('Journey 2 — mid-route passenger (a sub-segment of a longer ride)', () => {
  test('a passenger booking a strict sub-segment pays less than the full-route price, not the driver\'s full listed price', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    });

    const driver = await registerAndLogin(request, 10);
    const rider = await registerAndLogin(request, 11);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    // Create (but don't yet publish) Tunis -> Monastir, the full corridor.
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
    expect(createRes.ok(), 'Ride creation should succeed for a fully-verified driver').toBeTruthy();
    const ride = (await createRes.json()) as { id: string; contributionPerSeat: number };

    // The driver adds two real intermediate stops along the route — exactly
    // what a driver does on the publish wizard's stop-selection step.
    async function addViaStop(label: string, point: { lat: number; lng: number }) {
      const res = await request.post(`${API_PREFIX}/rides/${ride.id}/stops/custom`, {
        headers: { Authorization: `Bearer ${driver.accessToken}` },
        data: { label, lat: point.lat, lng: point.lng, role: 'via' },
      });
      expect(res.ok(), `Adding the ${label} stop should succeed`).toBeTruthy();
      return (await res.json()) as { id: string; label: string };
    }

    const hammametStop = await addViaStop('Hammamet', HAMMAMET);
    const sousseStop = await addViaStop('Sousse', SOUSSE);

    const publishRes = await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(publishRes.ok()).toBeTruthy();
    const published = (await publishRes.json()) as { id: string; contributionPerSeat: number };

    // A passenger genuinely searching Hammamet -> Sousse should find this
    // ride via the route-passthrough tier (its real, driver-selected stops
    // on both ends), matching §7's "search does not require exact
    // origin/destination equality" and §30's passenger-specific framing.
    const searchResult = await searchRidesAsRider(request, rider, { origin: HAMMAMET, destination: SOUSSE });
    const match = searchResult.candidates.find((c) => c.rideId === published.id);
    expect(match, 'The mid-route sub-segment should be discoverable even though it is not the ride\'s own endpoints').toBeDefined();

    // The passenger requests exactly that sub-segment.
    const { res: bookRes, json: booking } = await requestBooking(request, rider, published.id, {
      seatsRequested: 1,
      pickupStopId: hammametStop.id,
      dropoffStopId: sousseStop.id,
    });
    expect(bookRes.ok(), 'Booking a real driver-selected sub-segment should succeed').toBeTruthy();
    const bookingJson = booking as { id: string; contributionTotal: number };

    const accepted = await acceptBooking(request, driver, bookingJson.id);
    expect(accepted.status).toBe('accepted');

    // The actual spec claim under test: what the passenger pays for
    // Hammamet -> Sousse must be strictly less than the full Tunis ->
        // Monastir price for the same number of seats.
    const fullRoutePrice = published.contributionPerSeat * 1;
    expect(
      bookingJson.contributionTotal,
      `A mid-route passenger should pay less than the full-route price (${fullRoutePrice} DT), not the driver's full listed price`,
    ).toBeLessThan(fullRoutePrice);

    await request.dispose();
  });
});
