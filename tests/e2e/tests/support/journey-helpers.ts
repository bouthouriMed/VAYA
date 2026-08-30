import { expect, type APIRequestContext } from '@playwright/test';

/**
 * Shared real-HTTP helpers for the "vertical journey" suite
 * (docs/tdd_journey_test_matrix.md's V-01..V-10, docs/tdd_journey_test_report.md).
 *
 * These tests exist to verify the actual USER EXPERIENCE described in
 * docs/unified_driver_and_passenger_journey.md — every helper here calls the
 * real HTTP API exactly as the mobile app's RTK Query client would (same
 * convention as the pre-existing `search-to-booking.api.test.ts`), never a
 * service function or DB row directly. A journey test should read like a
 * script of what a real driver/passenger does and sees, not like a test of
 * `bookings.service.ts`'s internals. No mocking: real Postgres, real Redis,
 * and real OSRM when this environment's docker-composed instance has a
 * prepared routing graph (see `docker/osrm/prepare.sh`) — when it doesn't,
 * production's own real haversine-fallback path is what runs, which is
 * itself real, tested behavior, not a test-only stand-in.
 */

const API_PREFIX = '/api/v1';

export interface AuthedUser {
  userId: string;
  accessToken: string;
}

export interface GeoPoint {
  lat: number;
  lng: number;
}

function authHeader(user: AuthedUser) {
  return { Authorization: `Bearer ${user.accessToken}` };
}

export function randomTunisianPhone(salt = 0): string {
  const suffix = ((Date.now() + salt) % 100_000_000).toString().padStart(8, '0');
  return `+216${suffix}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** `POST /auth/otp/request` has a real, deliberate rate limit (5/minute per
 *  IP — auth.routes.ts, "an SMS-cost/spam-abuse surface") which a
 *  multi-journey suite running many registrations back-to-back from the
 *  same machine can legitimately hit. This is production behavior worth
 *  respecting, not a bug to route around — so this retries with the
 *  server's own advertised backoff (`"retry in N seconds"`) instead of
 *  weakening or bypassing the real limit. */
async function requestOtpWithBackoff(request: APIRequestContext, phone: string) {
  for (let attempt = 0; attempt < 4; attempt++) {
    const res = await request.post(`${API_PREFIX}/auth/otp/request`, { data: { phone } });
    if (res.ok()) return res;
    const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
    const match = body.error?.message?.match(/retry in (\d+) seconds?/i);
    if (res.status() === 429 && match) {
      await sleep((Number(match[1]) + 1) * 1000);
      continue;
    }
    return res; // a non-rate-limit failure — let the caller's assertion report it.
  }
  return request.post(`${API_PREFIX}/auth/otp/request`, { data: { phone } });
}

/** Registers (or logs into) a brand-new account via the real OTP flow — the
 *  one authentication mechanism every user of this app actually goes
 *  through, dev-mode `devCode` bypass included (auth.routes.ts). */
export async function registerAndLogin(request: APIRequestContext, salt = 0): Promise<AuthedUser> {
  const phone = randomTunisianPhone(salt);

  const otpRes = await requestOtpWithBackoff(request, phone);
  expect(otpRes.ok(), `OTP request should succeed for ${phone}`).toBeTruthy();
  const { devCode } = (await otpRes.json()) as { devCode?: string };
  expect(devCode).toBeTruthy();

  const verifyRes = await request.post(`${API_PREFIX}/auth/otp/verify`, { data: { phone, code: devCode } });
  expect(verifyRes.ok(), 'OTP verify should succeed').toBeTruthy();
  const tokens = (await verifyRes.json()) as { accessToken: string };

  const payload = JSON.parse(
    Buffer.from(tokens.accessToken.split('.')[1]!, 'base64').toString('utf-8'),
  ) as { sub: string };

  return { userId: payload.sub, accessToken: tokens.accessToken };
}

/** Logs in as the seeded admin (apps/api/src/db/seed.ts) — the real
 *  credential a human ops user would type, not a test bypass. */
export async function adminLogin(request: APIRequestContext): Promise<AuthedUser> {
  const res = await request.post(`${API_PREFIX}/admin/login`, {
    data: { email: 'admin@vaya.tn', password: 'VayaAdmin2026!' },
  });
  expect(res.ok(), 'Admin login should succeed with the seeded credential').toBeTruthy();
  const { accessToken } = (await res.json()) as { accessToken: string };
  return { userId: 'admin', accessToken };
}

/**
 * The real end-to-end path a person actually takes to become a bookable
 * driver: submit onboarding documents, then wait for admin review — exactly
 * as `docs/domain/verification-workflow.md` describes it, never bypassed.
 * A journey test that skips this and inserts an `approved` driver profile
 * directly into Postgres would no longer be testing what a real driver
 * experiences.
 */
export async function onboardAndApproveDriver(
  request: APIRequestContext,
  driver: AuthedUser,
  admin: AuthedUser,
  overrides?: Partial<{ make: string; model: string; color: string; seatCount: number }>,
): Promise<{ driverProfileId: string; vehicleId: string }> {
  const onboardingRes = await request.post(`${API_PREFIX}/drivers/onboarding`, {
    headers: authHeader(driver),
    data: {
      vehicle: {
        make: overrides?.make ?? 'Seat',
        model: overrides?.model ?? 'Leon',
        color: overrides?.color ?? 'Gris',
        plateNumber: `VJ-${Date.now() % 1_000_000}-${Math.floor(Math.random() * 1000)}`,
        seatCount: overrides?.seatCount ?? 4,
      },
      documents: [{ type: 'license', fileUrl: 'https://example.com/license.jpg' }],
    },
  });
  expect(onboardingRes.ok(), 'Driver onboarding submission should succeed').toBeTruthy();
  const profile = (await onboardingRes.json()) as { id: string; vehicles: { id: string }[] };

  const approveRes = await request.post(`${API_PREFIX}/admin/verifications/${profile.id}/approve`, {
    headers: authHeader(admin),
    data: {},
  });
  expect(approveRes.ok(), 'Admin approval of the driver profile should succeed').toBeTruthy();

  return { driverProfileId: profile.id, vehicleId: profile.vehicles[0]!.id };
}

export interface RideJson {
  id: string;
  status: string;
  contributionPerSeat: number;
  seatsTotal: number;
  seatsAvailable: number;
  pricing?: { min: number; recommended: number; max: number };
}

/** Creates a ride via the real `POST /rides` a driver's publish wizard
 *  calls, then immediately publishes it via the real `POST /rides/:id/publish`
 *  — mirrors the actual two-step flow (draft, then publish) a driver
 *  experiences, not a single synthetic "insert an already-published row." */
export async function createAndPublishRide(
  request: APIRequestContext,
  driver: AuthedUser,
  vehicleId: string,
  params: {
    originLabel: string;
    origin: GeoPoint;
    destinationLabel: string;
    destination: GeoPoint;
    departureAt: Date;
    seatsTotal?: number;
    contributionPerSeat?: number;
  },
): Promise<RideJson> {
  const createRes = await request.post(`${API_PREFIX}/rides`, {
    headers: authHeader(driver),
    data: {
      vehicleId,
      origin: { label: params.originLabel, lat: params.origin.lat, lng: params.origin.lng },
      destination: { label: params.destinationLabel, lat: params.destination.lat, lng: params.destination.lng },
      departureAt: params.departureAt.toISOString(),
      seatsTotal: params.seatsTotal ?? 4,
      ...(params.contributionPerSeat ? { contributionPerSeat: params.contributionPerSeat } : {}),
    },
  });
  expect(createRes.ok(), 'Ride creation should succeed for a fully-verified driver').toBeTruthy();
  const ride = (await createRes.json()) as RideJson;

  const publishRes = await request.post(`${API_PREFIX}/rides/${ride.id}/publish`, {
    headers: authHeader(driver),
  });
  expect(publishRes.ok(), 'A freshly-created ride should be publishable immediately').toBeTruthy();
  const published = (await publishRes.json()) as RideJson;
  return published;
}

export interface BookingJson {
  id: string;
  status: string;
  rideId: string;
  riderId: string;
  seatsRequested: number;
  pickupStopId: string | null;
  pickupLabel: string;
  dropoffStopId: string | null;
  contributionTotal?: number;
}

/** A rider's real request-a-seat action — `POST /rides/:rideId/requests`. */
export async function requestBooking(
  request: APIRequestContext,
  rider: AuthedUser,
  rideId: string,
  body: { seatsRequested?: number; pickupStopId?: string; pickup?: GeoPoint & { label: string }; dropoffStopId?: string; dropoff?: GeoPoint & { label: string } },
): Promise<{ res: Awaited<ReturnType<APIRequestContext['post']>>; json: BookingJson | { error: unknown } }> {
  const res = await request.post(`${API_PREFIX}/rides/${rideId}/requests`, {
    headers: authHeader(rider),
    data: { seatsRequested: body.seatsRequested ?? 1, ...body },
  });
  const json = (await res.json()) as BookingJson | { error: unknown };
  return { res, json };
}

export async function acceptBooking(request: APIRequestContext, driver: AuthedUser, bookingId: string) {
  const res = await request.post(`${API_PREFIX}/bookings/${bookingId}/accept`, { headers: authHeader(driver) });
  expect(res.ok(), `Accepting booking ${bookingId} should succeed`).toBeTruthy();
  return (await res.json()) as BookingJson;
}

export async function declineBooking(request: APIRequestContext, driver: AuthedUser, bookingId: string) {
  const res = await request.post(`${API_PREFIX}/bookings/${bookingId}/decline`, { headers: authHeader(driver) });
  return res;
}

export interface TripJson {
  id: string;
  status: string;
  bookingId: string;
  startedAt: string | null;
}

/** The real screen-facing lookup (`bookings/settlement.tsx` etc.) — a
 *  passenger/driver only ever knows their bookingId, never a trip id
 *  directly, until this call resolves one. */
export async function getTripForBooking(request: APIRequestContext, user: AuthedUser, bookingId: string): Promise<TripJson> {
  const res = await request.get(`${API_PREFIX}/bookings/${bookingId}/trip`, { headers: authHeader(user) });
  expect(res.ok(), `Fetching the trip for booking ${bookingId} should succeed once accepted`).toBeTruthy();
  return (await res.json()) as TripJson;
}

export async function startTrip(request: APIRequestContext, driver: AuthedUser, tripId: string) {
  const res = await request.post(`${API_PREFIX}/trips/${tripId}/start`, { headers: authHeader(driver) });
  return res;
}

export async function confirmPassengerAboard(request: APIRequestContext, user: AuthedUser, tripId: string) {
  const res = await request.post(`${API_PREFIX}/trips/${tripId}/passenger-aboard`, { headers: authHeader(user) });
  return res;
}

export async function completeTrip(request: APIRequestContext, user: AuthedUser, tripId: string) {
  const res = await request.post(`${API_PREFIX}/trips/${tripId}/complete`, { headers: authHeader(user) });
  return res;
}

export async function updateTripLocation(
  request: APIRequestContext,
  driver: AuthedUser,
  tripId: string,
  point: GeoPoint,
) {
  const res = await request.post(`${API_PREFIX}/trips/${tripId}/location`, {
    headers: authHeader(driver),
    data: { lat: point.lat, lng: point.lng },
  });
  return res;
}

export async function getTrackingState(request: APIRequestContext, user: AuthedUser, tripId: string) {
  const res = await request.get(`${API_PREFIX}/trips/${tripId}/tracking`, { headers: authHeader(user) });
  return res;
}

export async function submitRating(
  request: APIRequestContext,
  user: AuthedUser,
  tripId: string,
  body: { role: 'rider_rates_driver' | 'driver_rates_rider'; stars: number; punctualityFlag?: boolean; comment?: string },
) {
  const res = await request.post(`${API_PREFIX}/trips/${tripId}/ratings`, { headers: authHeader(user), data: body });
  return res;
}

export async function cancelBooking(request: APIRequestContext, user: AuthedUser, bookingId: string, reason?: string) {
  const res = await request.post(`${API_PREFIX}/bookings/${bookingId}/cancel`, {
    headers: authHeader(user),
    data: reason ? { reason } : {},
  });
  return res;
}

export async function reportNoShow(request: APIRequestContext, user: AuthedUser, bookingId: string) {
  const res = await request.post(`${API_PREFIX}/bookings/${bookingId}/report-no-show`, { headers: authHeader(user) });
  return res;
}

export async function searchRidesAsRider(
  request: APIRequestContext,
  rider: AuthedUser,
  params: { origin: GeoPoint; destination: GeoPoint; when?: Date },
) {
  const res = await request.get(`${API_PREFIX}/matching/search`, {
    headers: authHeader(rider),
    params: {
      originLat: params.origin.lat,
      originLng: params.origin.lng,
      destinationLat: params.destination.lat,
      destinationLng: params.destination.lng,
      when: (params.when ?? new Date()).toISOString(),
    },
  });
  expect(res.ok(), 'A search request should always return 200, even for zero results').toBeTruthy();
  return res.json() as Promise<{
    tier: string;
    message: string | null;
    candidates: Array<{
      rideId: string;
      matchType: string;
      pickupViable: boolean;
      dropoffViable: boolean;
      rankedStops: Array<{ stopId: string; label: string; walkMinutes: number }>;
      pickupEtaMinutes?: number;
      contributionPerSeat?: number;
    }>;
  }>;
}

/** Real Tunisian corridor already used by this codebase's own integration
 *  suites (bookings-segment-capacity.integration.test.ts,
 *  matching-tiers.integration.test.ts) — Tunis -> Hammamet -> Sousse ->
 *  Monastir. Reused here (rather than the packages/domain journey-contract
 *  fixtures' Madrid-Barcelona geometry) so these HTTP-level journeys stay
 *  consistent with the rest of apps/api's real test suite and with VAYA's
 *  actual market. */
export const TUNIS: GeoPoint = { lat: 36.8065, lng: 10.1815 };
export const HAMMAMET: GeoPoint = { lat: 36.4, lng: 10.61 };
export const SOUSSE: GeoPoint = { lat: 35.8256, lng: 10.6369 };
export const MONASTIR: GeoPoint = { lat: 35.7643, lng: 10.8113 };

export function inMinutes(n: number): Date {
  return new Date(Date.now() + n * 60_000);
}
