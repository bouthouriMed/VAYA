import { test, expect } from '@playwright/test';
import { registerAndLogin, adminLogin, onboardAndApproveDriver, type GeoPoint } from '../support/journey-helpers';

const API_PREFIX = '/api/v1';

/**
 * Journey 12 — Phase 14: the passenger never picks a point, the driver
 * only adds areas.
 *
 *   Driver publishes Ksar Said -> El Mourouj, adding "via Sidi Hassine" as
 *   an area (not a point).
 *   A passenger searches from next to the route, mid-way, to El Mourouj.
 *
 * The search returns the ride with ONE pickup chosen by VAYA (a point on
 * the driver's route here — no meeting points are loaded in this run), and
 * the area itself is never offered as a boarding stop. The passenger books
 * exactly that pair, without choosing anything; the driver sees the
 * request. Booking re-validates the point with a live routing call, so
 * that half needs a real routing engine and is skipped (with the reason)
 * when the ride's own route was only a straight-line estimate.
 */
const KSAR_SAID: GeoPoint = { lat: 36.812, lng: 10.115 };
const EL_MOUROUJ: GeoPoint = { lat: 36.73, lng: 10.21 };

test.describe('Journey 12 — VAYA picks the meeting point, the driver only adds areas', () => {
  test('search offers one VAYA-chosen pickup, the area is never a stop, and the pair books as-is', async ({
    playwright,
  }) => {
    const request = await playwright.request.newContext({
      baseURL: process.env.API_BASE_URL || 'http://localhost:3000',
    });
    const driver = await registerAndLogin(request, 120);
    const rider = await registerAndLogin(request, 121);
    const admin = await adminLogin(request);
    const { vehicleId } = await onboardAndApproveDriver(request, driver, admin);

    const departureAt = new Date();
    departureAt.setDate(departureAt.getDate() + 1);
    departureAt.setHours(7, 30, 0, 0);

    const createRes = await request.post(`${API_PREFIX}/rides`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: {
        vehicleId,
        origin: { label: 'Ksar Said', ...KSAR_SAID },
        destination: { label: 'El Mourouj', ...EL_MOUROUJ },
        departureAt: departureAt.toISOString(),
        seatsTotal: 3,
      },
    });
    expect(createRes.ok(), 'Ride creation should succeed').toBeTruthy();
    const ride = (await createRes.json()) as { id: string; routePolyline: string | null; routeIsEstimate: boolean };
    const rideId = ride.id;
    const routeIsEstimate = ride.routeIsEstimate;
    // No routing engine: the ride has no road geometry, so there is no
    // route to pass through or add an area to (the stubbed integration
    // tests in apps/api cover the logic; this journey needs the real thing).
    test.skip(!ride.routePolyline, 'Needs a live routing engine — the ride has no route geometry');

    // The middle of the driver's own route, wherever the routing engine
    // put it: an area there is always within the detour budget.
    const route = decodePolyline(ride.routePolyline!);
    const middle = route[Math.floor(route.length / 2)]!;

    const areaRes = await request.post(`${API_PREFIX}/rides/${rideId}/stops/custom`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
      data: { label: 'Sidi Hassine', lat: middle.lat, lng: middle.lng, role: 'area' },
    });
    expect(areaRes.ok(), 'Adding an area should succeed').toBeTruthy();
    const area = (await areaRes.json()) as { id: string; kind: string; radiusM: number | null };
    expect(area.kind).toBe('area');
    expect(area.radiusM).toBeGreaterThan(0);

    const publishRes = await request.post(`${API_PREFIX}/rides/${rideId}/publish`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    expect(publishRes.ok()).toBeTruthy();

    // ~250 m off the route, mid-way.
    const passengerOrigin = { lat: middle.lat + 0.002, lng: middle.lng + 0.001 };
    const searchRes = await request.get(`${API_PREFIX}/matching/search`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
      params: {
        originLat: passengerOrigin.lat,
        originLng: passengerOrigin.lng,
        destinationLat: EL_MOUROUJ.lat,
        destinationLng: EL_MOUROUJ.lng,
        when: departureAt.toISOString(),
      },
    });
    expect(searchRes.ok()).toBeTruthy();
    const search = (await searchRes.json()) as {
      candidates: Array<{
        rideId: string;
        destinationLat: number;
        destinationLng: number;
        rankedStops: Array<{ stopId: string }>;
        pickupPoint: { stopId: string | null; lat: number; lng: number; placeKind?: string | null; meetingPointId?: string | null } | null;
        dropoffPoint: { stopId: string | null; lat: number; lng: number } | null;
      }>;
    };
    const match = search.candidates.find((c) => c.rideId === rideId);
    expect(match, 'The ride passing next to the passenger should be found').toBeDefined();
    // One pickup, chosen by VAYA — never the area as a boarding stop.
    expect(match!.pickupPoint).not.toBeNull();
    expect(match!.pickupPoint!.stopId).toBeNull();
    expect(match!.rankedStops.map((s) => s.stopId)).not.toContain(area.id);

    test.skip(routeIsEstimate, 'Booking re-validates the meeting point with a live routing call — no routing engine here');

    // Exactly what the app sends (apps/mobile buildBookingPoints): the
    // server's own pair, nothing chosen by the passenger.
    const bookRes = await request.post(`${API_PREFIX}/rides/${rideId}/requests`, {
      headers: { Authorization: `Bearer ${rider.accessToken}` },
      data: {
        seatsRequested: 1,
        pickup: { label: 'Point de rencontre', lat: match!.pickupPoint!.lat, lng: match!.pickupPoint!.lng },
        requestedPickup: { label: 'Départ', ...passengerOrigin },
      },
    });
    expect(bookRes.ok(), 'Booking the server-chosen pair should succeed').toBeTruthy();
    const booking = (await bookRes.json()) as { id: string; pickupLat: number; pickupLng: number };
    expect(booking.pickupLat).toBeCloseTo(match!.pickupPoint!.lat, 5);

    const requestsRes = await request.get(`${API_PREFIX}/rides/${rideId}/requests`, {
      headers: { Authorization: `Bearer ${driver.accessToken}` },
    });
    const requests = (await requestsRes.json()) as Array<{ id: string }>;
    expect(requests.map((r) => r.id)).toContain(booking.id);
  });
});

function decodePolyline(encoded: string): GeoPoint[] {
  const points: GeoPoint[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}
