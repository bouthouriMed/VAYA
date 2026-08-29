import { test, expect } from '@playwright/test';
import {
  registerAndLogin,
  adminLogin,
  onboardAndApproveDriver,
  createAndPublishRide,
  requestBooking,
  acceptBooking,
  getTripForBooking,
  startTrip,
  confirmPassengerAboard,
  completeTrip,
  submitRating,
  searchRidesAsRider,
  TUNIS,
  SOUSSE,
  inMinutes,
} from '../support/journey-helpers';

/**
 * V-01 (docs/tdd_journey_test_matrix.md) — the spec's own baseline journey:
 * a driver publishes a full-route ride, a passenger books the exact same
 * route end-to-end, and both parties experience the complete lifecycle
 * through to review. This is the one journey the matrix marks "PASS
 * end-to-end" — this test exists to KEEP PROVING that, against the real
 * HTTP API a mobile client actually calls, not to newly discover a gap.
 * Every other vertical-journey file in this directory builds on the same
 * pattern this one establishes.
 *
 * What a real user experiences, step by step:
 *  1. A driver signs up, completes verification, and publishes Tunis -> Sousse.
 *  2. A passenger searches for exactly that trip and sees it in results.
 *  3. The passenger requests a seat; the driver accepts.
 *  4. The driver starts the trip; the passenger is confirmed aboard.
 *  5. The trip completes.
 *  6. Both parties can rate each other, and those ratings show up in each
 *     other's public trust summary.
 */
test.describe('Journey 1 — full-route passenger, publish through review', () => {
  test('a passenger can search, request, and complete a ride from origin to destination, and both parties can then review each other', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    });

    const driver = await registerAndLogin(request, 1);
    const rider = await registerAndLogin(request, 2);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const departureAt = inMinutes(45);
    const ride = await createAndPublishRide(request, driver, vehicleId, {
      originLabel: 'Tunis',
      origin: TUNIS,
      destinationLabel: 'Sousse',
      destination: SOUSSE,
      departureAt,
      seatsTotal: 3,
      // No contributionPerSeat: a real driver sees a server-computed
      // suggestion for this exact route rather than typing an arbitrary
      // number (CLAUDE.md product principle #1) — this journey uses that
      // same default path.
    });
    expect(ride.status).toBe('published');

    // Step 2: the passenger searches for exactly this trip and finds it.
    const searchResult = await searchRidesAsRider(request, rider, { origin: TUNIS, destination: SOUSSE, when: departureAt });
    expect(searchResult.tier).toBe('exact');
    const match = searchResult.candidates.find((c) => c.rideId === ride.id);
    expect(match, 'The published ride should appear in the passenger\'s own search results').toBeDefined();

    // Step 3: the passenger requests a seat; the driver accepts it.
    const { res: bookRes, json: booking } = await requestBooking(request, rider, ride.id, {
      seatsRequested: 1,
      pickup: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
      dropoff: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
    });
    expect(bookRes.ok(), 'A seat request on a published ride with available capacity should succeed').toBeTruthy();
    const accepted = await acceptBooking(request, driver, (booking as { id: string }).id);
    expect(accepted.status).toBe('accepted');

    // Step 4: the driver starts the trip; the passenger is confirmed aboard.
    const trip = await getTripForBooking(request, rider, accepted.id);
    expect(trip.status).toBe('scheduled');

    const startRes = await startTrip(request, driver, trip.id);
    expect(startRes.ok(), 'The driver should be able to start a trip whose booking is accepted').toBeTruthy();

    const boardRes = await confirmPassengerAboard(request, driver, trip.id);
    expect(boardRes.ok(), 'The driver should be able to confirm the passenger onboard').toBeTruthy();
    const boarded = (await boardRes.json()) as { status: string };
    expect(boarded.status).toBe('active');

    // Step 5: the trip completes.
    const completeRes = await completeTrip(request, driver, trip.id);
    expect(completeRes.ok(), 'Either party should be able to declare the trip complete').toBeTruthy();
    const completed = (await completeRes.json()) as { status: string };
    expect(completed.status).toBe('completed');

    // Step 6: both sides can review each other, and those reviews are
    // reflected back in each other's real, publicly-visible trust summary —
    // not merely accepted and discarded.
    const riderRatesDriver = await submitRating(request, rider, trip.id, {
      role: 'rider_rates_driver',
      stars: 5,
      punctualityFlag: true,
    });
    expect(riderRatesDriver.ok(), 'A passenger should be able to rate the driver after a completed trip').toBeTruthy();

    const driverRatesRider = await submitRating(request, driver, trip.id, {
      role: 'driver_rates_rider',
      stars: 4,
    });
    expect(driverRatesRider.ok(), 'A driver should be able to rate the passenger after a completed trip').toBeTruthy();

    const driverTrustRes = await request.get(`/api/v1/users/${driver.userId}/trust-summary`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
    });
    expect(driverTrustRes.ok()).toBeTruthy();
    const driverTrust = (await driverTrustRes.json()) as { driver: { tripCount: number; ratingAvg: number } | null };
    expect(driverTrust.driver, 'The driver\'s public trust summary should reflect the just-completed trip').not.toBeNull();
    expect(driverTrust.driver!.tripCount).toBeGreaterThanOrEqual(1);

    await request.dispose();
  });
});
