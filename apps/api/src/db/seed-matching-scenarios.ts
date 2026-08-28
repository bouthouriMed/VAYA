/* eslint-disable no-console -- CLI seed script; console output is the intended interface */
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema/index.js';
import { upsertRouteGeometry } from '../lib/spatial.js';
import { createBooking } from '../modules/bookings/bookings.service.js';
import { computeSuggestedPrice, DEFAULT_PRICING_CONFIG } from '@vaya/domain';

/**
 * Scenario seed for the matching-engine redesign — deliberately separate
 * from db/seed.ts (never modified by this script) and deliberately NOT
 * dependent on a real OSRM instance: this environment's docker-composed
 * OSRM never had its Tunisia extract prepared, so every route below is a
 * real, geometrically honest but hand-encoded polyline (straight legs
 * between real Tunisian coordinates — same discipline the codebase's own
 * integration tests already use when they insert `route_stops` directly
 * rather than going through OSRM-backed generation). Every ride's price is
 * still the real `computeSuggestedPrice` formula output, not a hand-typed
 * number, marked `isEstimate: true` since the distance/duration inputs
 * aren't OSRM-derived.
 *
 * Run after `pnpm db:seed` (or against a freshly truncated database) via:
 *   pnpm --filter @vaya/api exec tsx src/db/seed-matching-scenarios.ts
 *
 * See docs/roadmap/ or the matching-engine-redesign-test-cases.md file
 * this script's own final console output points at for exactly what each
 * ride/booking below is for and how to exercise it from the app.
 */

const { users, driverProfiles, vehicles, rides, routeStops } = schema;

function hoursFromNow(h: number): Date {
  return new Date(Date.now() + h * 3_600_000);
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6_371_000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

function routeLengthMeters(points: { lat: number; lng: number }[]): number {
  let total = 0;
  for (let i = 0; i < points.length - 1; i++) total += haversineMeters(points[i]!, points[i + 1]!);
  return total;
}

/** Standard Google encoded-polyline algorithm, precision 5 — matches
 *  lib/polyline.ts's `decodePolyline` contract exactly (that function is
 *  reused unmodified by every tier this scenario exercises). No OSRM call
 *  involved; this is just a geometry encoding, not a routing computation. */
function encodePolyline(points: { lat: number; lng: number }[]): string {
  let output = '';
  let prevLat = 0;
  let prevLng = 0;
  for (const { lat, lng } of points) {
    const lat5 = Math.round(lat * 1e5);
    const lng5 = Math.round(lng * 1e5);
    output += encodeSignedNumber(lat5 - prevLat);
    output += encodeSignedNumber(lng5 - prevLng);
    prevLat = lat5;
    prevLng = lng5;
  }
  return output;
}

function encodeSignedNumber(num: number): string {
  let sgnNum = num << 1;
  if (num < 0) sgnNum = ~sgnNum;
  return encodeNumber(sgnNum);
}

function encodeNumber(num: number): string {
  let output = '';
  while (num >= 0x20) {
    output += String.fromCharCode((0x20 | (num & 0x1f)) + 63);
    num >>= 5;
  }
  output += String.fromCharCode(num + 63);
  return output;
}

// Real Tunisian coordinates reused across scenarios so the whole seed reads
// as one coherent geography, not scattered arbitrary points.
const TUNIS = { lat: 36.8065, lng: 10.1815 };
const HAMMAMET = { lat: 36.4, lng: 10.61 };
const SOUSSE = { lat: 35.8256, lng: 10.6369 };
const MONASTIR = { lat: 35.7643, lng: 10.8113 };
const SFAX = { lat: 34.7406, lng: 10.7603 };
const ARIANA = { lat: 36.8625, lng: 10.1956 };

async function main(): Promise<void> {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Refusing to seed a production database');
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  const db = drizzle(pool, { schema });
  const base = Date.now() % 10_000_000;
  let phoneSeq = 0;
  function nextPhone(): string {
    phoneSeq += 1;
    return `+216${base}${String(phoneSeq).padStart(2, '0')}`;
  }

  console.log('Seeding matching-engine redesign test scenarios...');

  async function makeDriver(fullName: string, plate: string, seatCount: number) {
    const [user] = await db.insert(users).values({ phone: nextPhone(), fullName }).returning();
    const [profile] = await db
      .insert(driverProfiles)
      .values({ userId: user!.id, verificationStatus: 'approved' })
      .returning();
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: profile!.id,
        make: 'Renault',
        model: 'Symbol',
        color: 'Gris',
        plateNumber: plate,
        seatCount,
      })
      .returning();
    return { userId: user!.id, phone: user!.phone, driverProfileId: profile!.id, vehicleId: vehicle!.id };
  }

  async function makeRider(fullName: string) {
    const [user] = await db.insert(users).values({ phone: nextPhone(), fullName }).returning();
    return { userId: user!.id, phone: user!.phone };
  }

  function priceFor(points: { lat: number; lng: number }[]) {
    const distanceM = routeLengthMeters(points);
    const durationSec = distanceM / (70 / 3.6); // ~70 km/h average, coherent with an intercity/coastal-road trip.
    const suggested = computeSuggestedPrice(distanceM / 1000, durationSec / 60, DEFAULT_PRICING_CONFIG, {
      isEstimate: true,
    });
    return { distanceM, durationSec: Math.round(durationSec), contributionPerSeat: suggested.recommended };
  }

  // ── Scenario 1: segment-aware multi-passenger capacity ─────────────────
  // Ride R1, driver-accept flow. 2 seats total, real Hammamet/Sousse stops.
  // Three PENDING requests pre-created via the real createBooking() (same
  // validation a passenger's app call would go through): A and B occupy
  // genuinely non-overlapping segments and must BOTH be acceptable even
  // though the ride only has 2 seats; C overlaps A's segment and requesting
  // 2 more seats there must be rejected once A is accepted.
  console.log('\n[Scenario 1] Segment-aware multi-passenger capacity...');
  const d1 = await makeDriver('Sami Trabelsi', `SEG-${base}`, 2);
  const r1Route = [TUNIS, HAMMAMET, SOUSSE, MONASTIR];
  const r1Price = priceFor(r1Route);
  const [ride1] = await db
    .insert(rides)
    .values({
      driverProfileId: d1.driverProfileId,
      vehicleId: d1.vehicleId,
      originLabel: 'Tunis, Avenue Habib Bourguiba',
      originLat: TUNIS.lat,
      originLng: TUNIS.lng,
      destinationLabel: 'Monastir Centre',
      destinationLat: MONASTIR.lat,
      destinationLng: MONASTIR.lng,
      departureAt: hoursFromNow(3),
      seatsTotal: 2,
      seatsAvailable: 2,
      contributionPerSeat: r1Price.contributionPerSeat,
      status: 'published',
      routePolyline: encodePolyline(r1Route),
      estimatedDurationSec: r1Price.durationSec,
    })
    .returning();
  await upsertRouteGeometry(db, ride1!.id, encodePolyline(r1Route));
  const [r1Hammamet] = await db
    .insert(routeStops)
    .values({
      rideId: ride1!.id,
      sequence: 0,
      label: 'Hammamet, Avenue Moncef Bey',
      lat: HAMMAMET.lat,
      lng: HAMMAMET.lng,
      roadSnapped: false,
      isDriverSelected: true,
    })
    .returning();
  const [r1Sousse] = await db
    .insert(routeStops)
    .values({
      rideId: ride1!.id,
      sequence: 1,
      label: 'Sousse, Boulevard 14 Janvier',
      lat: SOUSSE.lat,
      lng: SOUSSE.lng,
      roadSnapped: false,
      isDriverSelected: true,
    })
    .returning();

  const riderA = await makeRider('Ines Zouari');
  const riderB = await makeRider('Karim Fassi');
  const riderC = await makeRider('Nour Khedher');

  const bookingA = await createBooking(db, ride1!.id, riderA.userId, {
    seatsRequested: 1,
    pickupStopId: r1Hammamet!.id,
    dropoffStopId: r1Sousse!.id,
  });
  const bookingB = await createBooking(db, ride1!.id, riderB.userId, {
    seatsRequested: 1,
    pickupStopId: r1Sousse!.id,
  });
  const bookingC = await createBooking(db, ride1!.id, riderC.userId, {
    seatsRequested: 2,
    pickupStopId: r1Hammamet!.id,
    dropoffStopId: r1Sousse!.id,
  });
  console.log(`  Ride R1: ${ride1!.id} (driver ${d1.phone}, 2 seats, Tunis->Hammamet->Sousse->Monastir)`);
  console.log(`  Booking A (${riderA.phone}, Hammamet->Sousse, 1 seat): ${bookingA.id} [pending]`);
  console.log(`  Booking B (${riderB.phone}, Sousse->Monastir, 1 seat): ${bookingB.id} [pending]`);
  console.log(`  Booking C (${riderC.phone}, Hammamet->Sousse, 2 seats): ${bookingC.id} [pending, conflicts with A]`);

  // ── Scenario 2: banded ranking, no tier hiding ──────────────────────────
  // Search Hammamet -> Sousse (~now): P1's real route runs straight through
  // both search points via real stops (excellent, matchType
  // route_passthrough); E1's own endpoints are a real "exact"-tier match
  // (within the tight radius/time window) but score low -- both must
  // appear together, P1 ranked first and flagged the standout.
  console.log('\n[Scenario 2] Banded ranking (excellent route_passthrough vs. a low-scoring exact match)...');
  const d2 = await makeDriver('Youssef Trabelsi', `EXA-${base}`, 3);
  const searchOrigin = { lat: 36.4, lng: 10.61 }; // "Hammamet Centre" -- type this into the app.
  const searchDestination = { lat: 35.8256, lng: 10.6369 }; // "Sousse Centre".
  const e1Origin = { lat: searchOrigin.lat + 0.01527, lng: searchOrigin.lng }; // ~1.7km away.
  const e1Destination = { lat: searchDestination.lat - 0.02246, lng: searchDestination.lng }; // ~2.5km away.
  const e1Price = priceFor([e1Origin, e1Destination]);
  const [ride2] = await db
    .insert(rides)
    .values({
      driverProfileId: d2.driverProfileId,
      vehicleId: d2.vehicleId,
      originLabel: 'Hammamet, Route de Nabeul',
      originLat: e1Origin.lat,
      originLng: e1Origin.lng,
      destinationLabel: 'Sousse, Sahloul',
      destinationLat: e1Destination.lat,
      destinationLng: e1Destination.lng,
      departureAt: hoursFromNow(0.75), // 45 min from now -- inside the exact tier's 90-min window, but not perfectly aligned.
      seatsTotal: 3,
      seatsAvailable: 3,
      contributionPerSeat: e1Price.contributionPerSeat,
      status: 'published',
      routePolyline: encodePolyline([e1Origin, e1Destination]),
      estimatedDurationSec: e1Price.durationSec,
    })
    .returning();
  await upsertRouteGeometry(db, ride2!.id, encodePolyline([e1Origin, e1Destination]));
  console.log(`  Ride E1: ${ride2!.id} (driver ${d2.phone}, low-scoring exact-tier endpoint match)`);

  const d3 = await makeDriver('Mehdi Gharbi', `PAS-${base}`, 3);
  const p1Route = [TUNIS, HAMMAMET, SOUSSE, MONASTIR];
  const p1Price = priceFor(p1Route);
  const [ride3] = await db
    .insert(rides)
    .values({
      driverProfileId: d3.driverProfileId,
      vehicleId: d3.vehicleId,
      originLabel: 'Tunis, Lac 2',
      originLat: TUNIS.lat,
      originLng: TUNIS.lng,
      destinationLabel: 'Monastir, Zone Touristique',
      destinationLat: MONASTIR.lat,
      destinationLng: MONASTIR.lng,
      departureAt: hoursFromNow(0.85), // ~51 min from now -- close to the search time.
      seatsTotal: 3,
      seatsAvailable: 3,
      contributionPerSeat: p1Price.contributionPerSeat,
      status: 'published',
      routePolyline: encodePolyline(p1Route),
      estimatedDurationSec: p1Price.durationSec,
    })
    .returning();
  await upsertRouteGeometry(db, ride3!.id, encodePolyline(p1Route));
  await db.insert(routeStops).values({
    rideId: ride3!.id,
    sequence: 0,
    label: 'Hammamet Centre',
    lat: searchOrigin.lat + 0.001,
    lng: searchOrigin.lng + 0.001,
    roadSnapped: false,
    isDriverSelected: true,
  });
  await db.insert(routeStops).values({
    rideId: ride3!.id,
    sequence: 1,
    label: 'Sousse Centre',
    lat: searchDestination.lat - 0.001,
    lng: searchDestination.lng - 0.001,
    roadSnapped: false,
    isDriverSelected: true,
  });
  console.log(`  Ride P1: ${ride3!.id} (driver ${d3.phone}, excellent route_passthrough match)`);
  console.log('  Search this from the app: origin "Hammamet Centre" (36.400, 10.610), destination "Sousse Centre" (35.8256, 10.6369), time: now.');

  // ── Scenario 3: trip-profile-aware thresholds ───────────────────────────
  // 3a. Commute-length search (Ariana, ~3km) -- the new narrower ~4km wide
  //     radius must exclude a ride 5.5km away that the OLD flat 8km radius
  //     would have included, while a genuinely nearby ride (F2) still shows.
  console.log('\n[Scenario 3a] Commute-profile radius narrowing...');
  const commuteOrigin = ARIANA;
  const commuteDestination = { lat: ARIANA.lat + 0.027, lng: ARIANA.lng }; // ~3km -- "El Menzah".
  const d4 = await makeDriver('Rania Chaabane', `CMT1-${base}`, 3);
  const f1Origin = { lat: commuteOrigin.lat + 0.0494, lng: commuteOrigin.lng }; // ~5.5km -- excluded under the new commute radius.
  const f1Price = priceFor([f1Origin, commuteDestination]);
  const [rideF1] = await db
    .insert(rides)
    .values({
      driverProfileId: d4.driverProfileId,
      vehicleId: d4.vehicleId,
      originLabel: 'Tunis, Le Bardo',
      originLat: f1Origin.lat,
      originLng: f1Origin.lng,
      destinationLabel: 'El Menzah',
      destinationLat: commuteDestination.lat,
      destinationLng: commuteDestination.lng,
      departureAt: hoursFromNow(1),
      seatsTotal: 3,
      seatsAvailable: 3,
      contributionPerSeat: f1Price.contributionPerSeat,
      status: 'published',
      routePolyline: encodePolyline([f1Origin, commuteDestination]),
      estimatedDurationSec: f1Price.durationSec,
    })
    .returning();
  await upsertRouteGeometry(db, rideF1!.id, encodePolyline([f1Origin, commuteDestination]));

  const d5 = await makeDriver('Hedi Sassi', `CMT2-${base}`, 3);
  const f2Origin = { lat: commuteOrigin.lat + 0.0252, lng: commuteOrigin.lng }; // ~2.8km -- still inside the new commute radius.
  const f2Price = priceFor([f2Origin, commuteDestination]);
  const [rideF2] = await db
    .insert(rides)
    .values({
      driverProfileId: d5.driverProfileId,
      vehicleId: d5.vehicleId,
      originLabel: 'Ariana, Route de Raoued',
      originLat: f2Origin.lat,
      originLng: f2Origin.lng,
      destinationLabel: 'El Menzah',
      destinationLat: commuteDestination.lat,
      destinationLng: commuteDestination.lng,
      departureAt: hoursFromNow(1),
      seatsTotal: 3,
      seatsAvailable: 3,
      contributionPerSeat: f2Price.contributionPerSeat,
      status: 'published',
      routePolyline: encodePolyline([f2Origin, commuteDestination]),
      estimatedDurationSec: f2Price.durationSec,
    })
    .returning();
  await upsertRouteGeometry(db, rideF2!.id, encodePolyline([f2Origin, commuteDestination]));
  console.log(`  Ride F1 (${rideF1!.id}, ~5.5km from search origin): must NOT appear.`);
  console.log(`  Ride F2 (${rideF2!.id}, ~2.8km from search origin): must appear.`);
  console.log('  Search this from the app: origin "Ariana" (36.8625, 10.1956), destination "El Menzah" (36.8895, 10.1956), time: now.');

  // 3b. Intercity-length search (Tunis -> Sfax, ~270km) -- the new wider
  //     ~20km radius must INCLUDE a ride whose endpoints are 15-18km off
  //     the search points, which the OLD flat 8-10km radius would have
  //     excluded entirely.
  console.log('\n[Scenario 3b] Intercity-profile radius widening...');
  const d6 = await makeDriver('Amine Bel Haj', `ICY-${base}`, 3);
  const i1Origin = { lat: TUNIS.lat - 0.1347, lng: TUNIS.lng }; // ~15km south of Tunis.
  const i1Destination = { lat: SFAX.lat + 0.1617, lng: SFAX.lng }; // ~18km north of Sfax.
  const i1Price = priceFor([i1Origin, i1Destination]);
  const [rideI1] = await db
    .insert(rides)
    .values({
      driverProfileId: d6.driverProfileId,
      vehicleId: d6.vehicleId,
      originLabel: 'Grombalia',
      originLat: i1Origin.lat,
      originLng: i1Origin.lng,
      destinationLabel: 'Sfax, Route de Tunis',
      destinationLat: i1Destination.lat,
      destinationLng: i1Destination.lng,
      departureAt: hoursFromNow(2),
      seatsTotal: 3,
      seatsAvailable: 3,
      contributionPerSeat: i1Price.contributionPerSeat,
      status: 'published',
      routePolyline: encodePolyline([i1Origin, i1Destination]),
      estimatedDurationSec: i1Price.durationSec,
    })
    .returning();
  await upsertRouteGeometry(db, rideI1!.id, encodePolyline([i1Origin, i1Destination]));
  console.log(`  Ride I1 (${rideI1!.id}, ~15km/18km off the search points): must appear (would NOT have, pre-Phase-A).`);
  console.log('  Search this from the app: origin "Tunis" (36.8065, 10.1815), destination "Sfax" (34.7406, 10.7603), time: now.');

  console.log('\nScenario seed complete.');
  console.log('Rider accounts (OTP-based login, use any phone above):');
  console.log(`  Driver D1 (segment capacity): ${d1.phone}`);
  console.log(`  Rider A: ${riderA.phone} | Rider B: ${riderB.phone} | Rider C: ${riderC.phone}`);
  console.log(`  Driver D2 (E1): ${d2.phone} | Driver D3 (P1): ${d3.phone}`);
  console.log(`  Driver D4 (F1): ${d4.phone} | Driver D5 (F2): ${d5.phone} | Driver D6 (I1): ${d6.phone}`);
  console.log('To fetch an OTP code: SELECT code FROM otp_codes WHERE phone = \'<phone>\' ORDER BY created_at DESC LIMIT 1;');

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
