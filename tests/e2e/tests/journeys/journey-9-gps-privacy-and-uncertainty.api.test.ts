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
  getTrackingState,
  TUNIS,
  SOUSSE,
  inMinutes,
} from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * V-09 (docs/tdd_journey_test_matrix.md) — spec §32 (invariant, §62
 * "Tracking: private driver telemetry and passenger-facing live location
 * are separate permission/data flows") and P7 "Never expose false
 * certainty":
 *
 *   "Pre-boarding: passenger sees ETA/pickup/route info, NEVER raw driver
 *    GPS."
 *
 * What a real, not-yet-boarded passenger should experience: they should
 * see useful trip info (status, ETA, pickup/destination) but never the
 * driver's exact live coordinates before they are actually in the car —
 * that's a real privacy boundary, not a cosmetic one (a driver's raw
 * position reveals where they are RIGHT NOW to a stranger they haven't even
 * met yet).
 *
 * Confirmed live, this session: `getTrackingState` (trips.service.ts,
 * ~L490-521) returns `currentLat`/`currentLng` unconditionally, with no
 * branch at all on `trip.status` or on which party is asking. This test is
 * expected to FAIL today, over the real tracking endpoint the mobile app's
 * pre-boarding tracking screen actually polls.
 */
test.describe('Journey 9 — pre-boarding tracking privacy', () => {
  test('a passenger who has not boarded yet never receives the driver\'s raw live coordinates', async ({ playwright }) => {
    const request = await playwright.request.newContext({ baseURL: process.env.API_BASE_URL || 'http://localhost:3000' });

    const driver = await registerAndLogin(request, 60);
    const rider = await registerAndLogin(request, 61);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Tunis', lat: TUNIS.lat, lng: TUNIS.lng },
        destination: { label: 'Sousse', lat: SOUSSE.lat, lng: SOUSSE.lng },
        departureAt: inMinutes(10).toISOString(),
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
    const accepted = await acceptBooking(request, driver, bookingJson.id);

    const trip = await getTripForBooking(request, rider, accepted.id);
    const startRes = await startTrip(request, driver, trip.id);
    expect(startRes.ok()).toBeTruthy();

    // The driver is genuinely broadcasting a real position — the passenger
    // has NOT boarded yet. Deliberately NOT the exact pickup point — a real
    // driver update that close would (correctly) auto-transition the trip
    // straight to `pickup` via computeAutoTripStatusTransition's real
    // proximity logic (tracking-transitions.ts), which isn't what this test
    // is about. A point ~15km short of Tunis keeps the trip genuinely
    // `driver_approaching`, still unambiguously pre-boarding.
    const stillEnRoute = { lat: TUNIS.lat - 0.13, lng: TUNIS.lng };
    const locationRes = await updateTripLocation(request, driver, trip.id, stillEnRoute);
    expect(locationRes.ok()).toBeTruthy();

    const trackingRes = await getTrackingState(request, rider, trip.id);
    expect(trackingRes.ok(), 'The passenger should still be able to read a tracking state pre-boarding (status/ETA/pickup)').toBeTruthy();
    const tracking = (await trackingRes.json()) as { tripStatus: string; currentLat: number | null; currentLng: number | null };
    // Either pre-boarding status is fine here — the privacy invariant this
    // test checks must hold across all of them, not just one.
    expect(['driver_approaching', 'pickup']).toContain(tracking.tripStatus);
    expect(
      tracking.currentLat,
      'A not-yet-boarded passenger must never receive the driver\'s raw current latitude (spec §32, INV-06) — today getTrackingState returns it unconditionally regardless of trip status',
    ).toBeNull();
    expect(
      tracking.currentLng,
      'A not-yet-boarded passenger must never receive the driver\'s raw current longitude (spec §32, INV-06)',
    ).toBeNull();

    await request.dispose();
  });
});
