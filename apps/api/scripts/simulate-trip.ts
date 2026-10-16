/**
 * Plays the driver in a live-tracked trip, so one person can try passenger-
 * side live tracking without a second phone in a moving car:
 *
 *   pnpm --filter @vaya/api trip:simulate <passenger user-id | phone | email> [options]
 *   # on the Oracle VM, inside the running API container:
 *   docker compose -f docker/docker-compose.oracle.yml --env-file docker/.env.prod \
 *     exec api pnpm trip:simulate +21612345678
 *
 * What it does, through the real services (same code paths as the app):
 * 1. Creates (once, then reuses) a simulated driver "Sami (simulation)" with
 *    an approved profile and a vehicle. Its phone is a non-dialable +2160…
 *    number, so nobody can sign in as it.
 * 2. Cancels any earlier simulation ride still open, then publishes a fresh
 *    ride (real road route), books 1 seat for the passenger with a pickup
 *    part-way along the route, and accepts it — the passenger gets the
 *    usual "accepted" notification and sees the booking under Trajets.
 * 3. After a countdown (time to open the booking on the device), taps
 *    "Démarrer", then moves the car along the route sending a GPS fix every
 *    few seconds, waits at the pickup, confirms "Passager à bord", drives on
 *    to the destination and completes the trip.
 *
 * Tracking pushes go out through Redis pub/sub, so the API process's
 * WebSocket sockets receive them exactly as if a driver's phone had sent
 * them. Before boarding, the passenger sees status/ETA but not the car's
 * raw position (privacy rule, lib/realtime.ts); the car appears once aboard.
 *
 * Options:
 *   --from lat,lng       driver start (default: Avenue Habib Bourguiba, Tunis)
 *   --to lat,lng         destination (default: Lac 1, Tunis)
 *   --pickup-at 0.3      where the pickup sits along the route (0-1)
 *   --speed 15           simulated speed, m/s (15 ≈ 54 km/h)
 *   --tick 4             seconds between GPS fixes
 *   --countdown 45       seconds before the driver taps "Démarrer"
 *   --wait-pickup 20     seconds parked at the pickup before boarding
 */
import { and, eq, inArray } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../src/lib/database.js';
import { closeQueue } from '../src/lib/queue.js';
import { getRoute } from '../src/lib/routing.js';
import { decodePolyline, type LatLng } from '../src/lib/polyline.js';
import { haversineDistanceMeters } from '../src/lib/geo.js';
import { users, driverProfiles, vehicles, rides, bookings, trips } from '../src/db/schema/index.js';
import { createBooking, acceptBooking } from '../src/modules/bookings/bookings.service.js';
import {
  startTrip,
  confirmPassengerAboard,
  updateTripLocation,
  completeTrip,
} from '../src/modules/trips/trips.service.js';

const SIM_DRIVER_PHONE = '+21600000000';
const SIM_DRIVER_NAME = 'Sami (simulation)';
const SIM_PLATE = 'SIM-0000';

const DEFAULT_FROM: LatLng = { lat: 36.7992, lng: 10.1811 };
const DEFAULT_TO: LatLng = { lat: 36.8324, lng: 10.2334 };

const db = getDatabase();

interface Options {
  who: string;
  from: LatLng;
  to: LatLng;
  pickupAt: number;
  speed: number;
  tick: number;
  countdown: number;
  waitPickup: number;
}

function parseLatLng(value: string, flag: string): LatLng {
  const [lat, lng] = value.split(',').map(Number);
  if (lat === undefined || lng === undefined || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    throw new Error(`${flag} expects "lat,lng", got "${value}"`);
  }
  return { lat, lng };
}

function parseNumber(value: string, flag: string, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < min || n > max) throw new Error(`${flag} must be between ${min} and ${max}`);
  return n;
}

function parseArgs(argv: string[]): Options {
  const [who, ...rest] = argv;
  if (!who || who.startsWith('--')) {
    throw new Error('Usage: pnpm trip:simulate <passenger user-id | phone | email> [--from lat,lng] [--to lat,lng] ...');
  }
  const opts: Options = {
    who,
    from: DEFAULT_FROM,
    to: DEFAULT_TO,
    pickupAt: 0.3,
    speed: 15,
    tick: 4,
    countdown: 45,
    waitPickup: 20,
  };
  for (let i = 0; i < rest.length; i += 2) {
    const flag = rest[i];
    const value = rest[i + 1];
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    switch (flag) {
      case '--from': opts.from = parseLatLng(value, flag); break;
      case '--to': opts.to = parseLatLng(value, flag); break;
      case '--pickup-at': opts.pickupAt = parseNumber(value, flag, 0.05, 0.9); break;
      case '--speed': opts.speed = parseNumber(value, flag, 1, 60); break;
      // ≥ 1s: updateTripLocation is called in-process (no HTTP rate limit),
      // so this is the only thing keeping the ETA/notification paths sane.
      case '--tick': opts.tick = parseNumber(value, flag, 1, 30); break;
      case '--countdown': opts.countdown = parseNumber(value, flag, 0, 600); break;
      case '--wait-pickup': opts.waitPickup = parseNumber(value, flag, 0, 600); break;
      default: throw new Error(`Unknown option ${flag}`);
    }
  }
  return opts;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function findPassenger(who: string) {
  const all = await db.select().from(users).where(eq(users.phone, who));
  const byPhone = all[0];
  if (byPhone) return byPhone;
  const [byEmail] = await db.select().from(users).where(eq(users.email, who));
  if (byEmail) return byEmail;
  if (/^[0-9a-f-]{36}$/i.test(who)) {
    const [byId] = await db.select().from(users).where(eq(users.id, who));
    if (byId) return byId;
  }
  throw new Error(`No user found for "${who}" (try the user id, the +216… phone, or the email)`);
}

async function ensureSimDriver() {
  let [user] = await db.select().from(users).where(eq(users.phone, SIM_DRIVER_PHONE));
  if (!user) {
    [user] = await db.insert(users).values({ phone: SIM_DRIVER_PHONE, fullName: SIM_DRIVER_NAME }).returning();
  }
  if (!user) throw new Error('Could not create the simulated driver');

  let profile = await db.query.driverProfiles.findFirst({ where: eq(driverProfiles.userId, user.id) });
  if (!profile) {
    [profile] = await db
      .insert(driverProfiles)
      .values({ userId: user.id, verificationStatus: 'approved' })
      .returning();
  } else if (profile.verificationStatus !== 'approved') {
    [profile] = await db
      .update(driverProfiles)
      .set({ verificationStatus: 'approved' })
      .where(eq(driverProfiles.id, profile.id))
      .returning();
  }
  if (!profile) throw new Error('Could not create the simulated driver profile');

  let vehicle = await db.query.vehicles.findFirst({ where: eq(vehicles.driverProfileId, profile.id) });
  if (!vehicle) {
    [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: profile.id,
        make: 'Peugeot',
        model: '208',
        color: 'Gris',
        plateNumber: SIM_PLATE,
        seatCount: 4,
      })
      .returning();
  }
  if (!vehicle) throw new Error('Could not create the simulated vehicle');

  return { userId: user.id, profileId: profile.id, vehicleId: vehicle.id };
}

/** Closes whatever an earlier (interrupted) run left open, so the
 *  passenger's Trajets list never piles up stale simulation rides. */
async function closePreviousSimRides(profileId: string) {
  const open = await db
    .select({ id: rides.id })
    .from(rides)
    .where(
      and(
        eq(rides.driverProfileId, profileId),
        inArray(rides.status, ['draft', 'published', 'full', 'in_progress']),
      ),
    );
  if (open.length === 0) return;
  const rideIds = open.map((r) => r.id);
  const now = new Date();
  await db
    .update(trips)
    .set({ status: 'cancelled', updatedAt: now })
    .where(
      and(
        inArray(trips.rideId, rideIds),
        inArray(trips.status, ['scheduled', 'driver_approaching', 'pickup', 'active', 'arriving']),
      ),
    );
  await db
    .update(bookings)
    .set({ status: 'cancelled_by_driver', updatedAt: now })
    .where(and(inArray(bookings.rideId, rideIds), inArray(bookings.status, ['pending', 'accepted'])));
  await db.update(rides).set({ status: 'cancelled', updatedAt: now }).where(inArray(rides.id, rideIds));
  console.log(`Closed ${rideIds.length} earlier simulation ride(s).`);
}

/** Cumulative distance along the route, so the car can be placed at any
 *  distance and the pickup at a fraction of the length. */
function buildPath(points: LatLng[]) {
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    cumulative.push(cumulative[i - 1]! + haversineDistanceMeters(points[i - 1]!, points[i]!));
  }
  const total = cumulative[cumulative.length - 1]!;

  function at(distance: number): { point: LatLng; headingDeg: number } {
    const d = Math.min(Math.max(distance, 0), total);
    let i = 1;
    while (i < points.length - 1 && cumulative[i]! < d) i++;
    const a = points[i - 1]!;
    const b = points[i]!;
    const span = cumulative[i]! - cumulative[i - 1]!;
    const t = span > 0 ? (d - cumulative[i - 1]!) / span : 0;
    const point = { lat: a.lat + (b.lat - a.lat) * t, lng: a.lng + (b.lng - a.lng) * t };
    const y = Math.sin(((b.lng - a.lng) * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180);
    const x =
      Math.cos((a.lat * Math.PI) / 180) * Math.sin((b.lat * Math.PI) / 180) -
      Math.sin((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.cos(((b.lng - a.lng) * Math.PI) / 180);
    const headingDeg = ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
    return { point, headingDeg };
  }

  return { total, at };
}

async function currentTripStatus(tripId: string) {
  const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
  return trip?.status;
}

async function main(): Promise<void> {
  const opts = parseArgs(process.argv.slice(2));
  const passenger = await findPassenger(opts.who);
  console.log(`Passenger: ${passenger.fullName} (${passenger.id})`);

  const driver = await ensureSimDriver();
  if (driver.userId === passenger.id) throw new Error('The passenger cannot be the simulated driver');
  await closePreviousSimRides(driver.profileId);

  const route = await getRoute(opts.from, opts.to);
  const points = route.polyline ? decodePolyline(route.polyline) : [opts.from, opts.to];
  if (route.isEstimate) {
    console.log('Note: no routing engine answered — the car will drive a straight line.');
  }
  const path = buildPath(points);
  const pickupDistance = path.total * opts.pickupAt;
  const pickup = path.at(pickupDistance).point;
  console.log(`Route: ${(path.total / 1000).toFixed(1)} km, pickup at ${(pickupDistance / 1000).toFixed(1)} km`);

  const [ride] = await db
    .insert(rides)
    .values({
      driverProfileId: driver.profileId,
      vehicleId: driver.vehicleId,
      originLabel: 'Départ (simulation)',
      originLat: opts.from.lat,
      originLng: opts.from.lng,
      destinationLabel: 'Arrivée (simulation)',
      destinationLat: opts.to.lat,
      destinationLng: opts.to.lng,
      departureAt: new Date(Date.now() + 2 * 60_000),
      seatsTotal: 1,
      seatsAvailable: 1,
      contributionPerSeat: 3,
      status: 'published',
      routePolyline: route.polyline || null,
      estimatedDurationSec: route.durationSec,
    })
    .returning();
  if (!ride) throw new Error('Failed to create the simulation ride');

  const booking = await createBooking(db, ride.id, passenger.id, {
    seatsRequested: 1,
    pickup: { label: 'Point de prise en charge (simulation)', lat: pickup.lat, lng: pickup.lng },
  });
  await acceptBooking(db, booking.id, driver.userId);
  const trip = await db.query.trips.findFirst({ where: eq(trips.bookingId, booking.id) });
  if (!trip) throw new Error('Accepting the booking did not create a trip');
  console.log(`Ride ${ride.id}\nBooking ${booking.id} (accepted)\nTrip ${trip.id}`);

  console.log(
    `\nOn the tablet: Trajets → the booking with "${SIM_DRIVER_NAME}" → open it (and the live view).` +
      `\nDriver taps "Démarrer" in ${opts.countdown}s…`,
  );
  for (let left = opts.countdown; left > 0; left -= 5) {
    process.stdout.write(`  ${left}s\n`);
    await sleep(Math.min(5, left) * 1000);
  }

  await startTrip(db, trip.id, driver.userId);
  console.log('▶ Trip started (driver approaching)');

  const step = opts.speed * opts.tick;
  const ping = async (distance: number, speedMps: number, label: string) => {
    const { point, headingDeg } = path.at(distance);
    const result = await updateTripLocation(db, trip.id, driver.userId, {
      ...point,
      headingDeg,
      speedMps,
      accuracyM: 5,
    });
    const eta = result.etaSec != null ? `${Math.round(result.etaSec / 60)} min` : '—';
    console.log(
      `  ${label} ${(distance / 1000).toFixed(2)} km · trip ${result.trip.status} · tracking ${result.trackingStatus} · ETA ${eta}`,
    );
    return result.trip.status;
  };

  // Leg 1: towards the pickup.
  let distance = 0;
  while (distance < pickupDistance) {
    await ping(distance, opts.speed, '→ pickup');
    distance = Math.min(distance + step, pickupDistance);
    await sleep(opts.tick * 1000);
  }

  // Parked at the pickup (sustained proximity), then boarding.
  const waitUntil = Date.now() + opts.waitPickup * 1000;
  let status = await ping(pickupDistance, 0, '■ at pickup');
  while (Date.now() < waitUntil && status !== 'active') {
    await sleep(opts.tick * 1000);
    status = await ping(pickupDistance, 0, '■ at pickup');
  }
  if ((await currentTripStatus(trip.id)) !== 'active') {
    await confirmPassengerAboard(db, trip.id, driver.userId);
  }
  console.log('✓ Passenger aboard — the car is now visible on the tablet');

  // Leg 2: towards the destination.
  distance = pickupDistance;
  while (distance < path.total) {
    distance = Math.min(distance + step, path.total);
    status = await ping(distance, distance < path.total ? opts.speed : 0, '→ destination');
    if (status === 'completed') break;
    await sleep(opts.tick * 1000);
  }

  if ((await currentTripStatus(trip.id)) !== 'completed') {
    await completeTrip(db, trip.id, driver.userId);
  }
  console.log('✓ Trip completed — the tablet should move to the settlement / rating screen');
}

main()
  .then(async () => {
    await closeQueue();
    await closeDatabase();
    process.exit(0);
  })
  .catch(async (err: unknown) => {
    console.error(err instanceof Error ? err.message : err);
    await closeQueue().catch(() => undefined);
    await closeDatabase().catch(() => undefined);
    process.exit(1);
  });
