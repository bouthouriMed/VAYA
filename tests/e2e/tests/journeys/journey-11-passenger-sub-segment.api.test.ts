import { test, expect } from '@playwright/test';
import {
  registerAndLogin,
  adminLogin,
  onboardAndApproveDriver,
  searchRidesAsRider,
  requestBooking,
  type GeoPoint,
} from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * Journey 11 — the passenger's journey is a sub-segment of the driver's
 * route, never replaced by it (reported bug).
 *
 *   Driver A publishes  Cité Tahrir -> La Marsa  at 19:10
 *   Passenger B searches Menzah 6  -> Lac 2     at 19:20
 *
 * The passenger's result must be THEIR journey — pickup near Menzah 6,
 * dropoff near Lac 2 — not "Menzah 6 -> La Marsa". The driver keeps seeing
 * their own Cité Tahrir -> La Marsa ride, plus this passenger's pickup/
 * dropoff and the (zero) extra detour of two planned stops.
 */
const CITE_TAHRIR: GeoPoint = { lat: 36.826, lng: 10.14 };
const MENZAH_6: GeoPoint = { lat: 36.848, lng: 10.172 };
const LAC_2: GeoPoint = { lat: 36.851, lng: 10.272 };
const LA_MARSA: GeoPoint = { lat: 36.878, lng: 10.324 };

test.describe('Journey 11 — passenger sub-segment of a longer urban ride', () => {
  test('Menzah 6 -> Lac 2 on a Cité Tahrir -> La Marsa ride shows the passenger their own segment', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    });
    const driver = await registerAndLogin(request, 110);
    const rider = await registerAndLogin(request, 111);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const departureAt = new Date();
    departureAt.setDate(departureAt.getDate() + 1);
    departureAt.setHours(19, 10, 0, 0);

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Cité Tahrir', ...CITE_TAHRIR },
        destination: { label: 'La Marsa', ...LA_MARSA },
        departureAt: departureAt.toISOString(),
        seatsTotal: 3,
      },
    });
    expect(createRes.ok(), 'Ride creation should succeed').toBeTruthy();
    const ride = (await createRes.json()) as { id: string };

    for (const [label, point] of [['Menzah 6', MENZAH_6], ['Lac 2', LAC_2]] as const) {
      const res = await request.post(`${API_PREFIX}/rides/${ride.id}/stops/custom`, {
        headers: { Authorization: `Bearer ${driver.accessToken}` },
        data: { label, lat: point.lat, lng: point.lng, role: 'via' },
      });
      expect(res.ok(), `Adding the ${label} stop should succeed`).toBeTruthy();
    }
    const publishRes = await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(publishRes.ok()).toBeTruthy();

    const passengerOrigin = { lat: 36.8495, lng: 10.1735 };
    const passengerDestination = { lat: 36.853, lng: 10.2735 };
    const searchResult = await searchRidesAsRider(request, rider, {
      origin: passengerOrigin,
      destination: passengerDestination,
      when: new Date(departureAt.getTime() + 10 * 60_000),
    });
    const match = searchResult.candidates.find((c) => c.rideId === ride.id);
    expect(match, 'The Menzah 6 -> Lac 2 sub-segment should be discoverable').toBeDefined();

    // Passenger-facing: their own journey, with Menzah 6 / Lac 2 points.
    expect(match!.passengerJourney).toEqual({
      originLat: passengerOrigin.lat,
      originLng: passengerOrigin.lng,
      destinationLat: passengerDestination.lat,
      destinationLng: passengerDestination.lng,
    });
    expect(match!.pickupPoint?.label).toBe('Menzah 6');
    expect(match!.dropoffPoint?.label).toBe('Lac 2');
    expect(match!.dropoffPoint?.label).not.toBe('La Marsa');
    expect(match!.pickupEtaSeconds).toBeGreaterThan(0);
    expect(match!.pickupEtaSeconds).toBeLessThan(match!.dropoffEtaSeconds);

    // Driver's own route is untouched in the result.
    expect({ lat: match!.destinationLat, lng: match!.destinationLng }).toEqual(LA_MARSA);

    const { res: bookRes, json: booking } = await requestBooking(request, rider, ride.id, {
      seatsRequested: 1,
      pickupStopId: match!.pickupPoint!.stopId!,
      dropoffStopId: match!.dropoffPoint!.stopId!,
    });
    expect(bookRes.ok(), 'Booking the resolved sub-segment should succeed').toBeTruthy();
    const bookingId = (booking as { id: string }).id;

    // Driver-facing: their own ride, plus this passenger's points/detour.
    const rideRes = await request.get(`${API_PREFIX}/rides/${ride.id}`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    const driverRide = (await rideRes.json()) as { originLabel: string; destinationLabel: string };
    expect(driverRide.originLabel).toBe('Cité Tahrir');
    expect(driverRide.destinationLabel).toBe('La Marsa');

    const previewRes = await request.get(`${API_PREFIX}/bookings/${bookingId}/detour-preview`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(previewRes.ok()).toBeTruthy();
    const preview = (await previewRes.json()) as {
      pickup: { label: string; deviationSeconds: number };
      dropoff: { label: string; deviationSeconds: number };
    };
    expect(preview.pickup.label).toBe('Menzah 6');
    expect(preview.dropoff.label).toBe('Lac 2');
    expect(typeof preview.pickup.deviationSeconds).toBe('number');
    expect(typeof preview.dropoff.deviationSeconds).toBe('number');

    await request.dispose();
  });
});
