import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import { users, driverProfiles, vehicles, rides, bookings } from '../../../db/schema/index.js';
import { createBooking } from '../bookings.service.js';

/**
 * Journey-contract suite (docs/tdd_journey_test_matrix.md M-050, M-054,
 * EDGE-deadline-1/2) — spec §19/§20: every request has a server-
 * authoritative response deadline, visible to the passenger immediately
 * after requesting and to the driver inside the incoming request.
 *
 * Confirms, via a real Postgres row and the real `createBooking` return
 * value (exactly what the API response serializes), that no such field
 * exists anywhere: not on the returned object, not on the persisted row.
 * `bookingStatusEnum` includes 'expired' as a valid status (confirmed by
 * schema inspection), but nothing computes or stores a deadline that would
 * ever justify transitioning into it.
 */
describe('booking deadline visibility — server-authoritative expiresAt does not exist (M-054)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let rideId: string;
  let riderId: string;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;
    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Deadline Test Driver' })
      .returning();
    driverUserId = driverUser!.id;
    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileId = driverProfile!.id;
    const [vehicle] = await db
      .insert(vehicles)
      .values({ driverProfileId, make: 'Test', model: 'Car', color: 'Red', plateNumber: `DDL-${base}`, seatCount: 4 })
      .returning();
    vehicleId = vehicle!.id;
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Tunis',
        originLat: 36.8065,
        originLng: 10.1815,
        destinationLabel: 'Sousse',
        destinationLat: 35.8256,
        destinationLng: 10.6369,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 15,
        status: 'published',
      })
      .returning();
    rideId = ride!.id;
    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Deadline Test Rider' })
      .returning();
    riderId = rider!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.id, rideId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderId));
    await closeDatabase();
  });

  it('FAIL (missing, M-054): createBooking\'s return value carries no expiresAt/deadline field the passenger could be shown', async () => {
    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Free-form pickup', lat: 36.8, lng: 10.2 },
    });
    expect((booking as Record<string, unknown>).expiresAt).toBeUndefined();
    expect((booking as Record<string, unknown>).deadline).toBeUndefined();
    expect((booking as Record<string, unknown>).responseDeadline).toBeUndefined();
  });

  it('FAIL (missing, M-054): the persisted row itself has no deadline column — confirmed against the real schema, not just the returned object', async () => {
    const [rideForRow] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Tunis',
        originLat: 36.8065,
        originLng: 10.1815,
        destinationLabel: 'Hammamet',
        destinationLat: 36.4,
        destinationLng: 10.61,
        departureAt: new Date(Date.now() + 7_200_000),
        seatsTotal: 4,
        seatsAvailable: 4,
        contributionPerSeat: 10,
        status: 'published',
      })
      .returning();
    try {
      const booking = await createBooking(db, rideForRow!.id, riderId, {
        seatsRequested: 1,
        pickup: { label: 'Another free-form pickup', lat: 36.8, lng: 10.2 },
      });
      const [row] = await db.select().from(bookings).where(eq(bookings.id, booking.id));
      expect(row).toBeDefined();
      expect(Object.keys(row!)).not.toContain('expiresAt');
      expect(Object.keys(row!)).not.toContain('deadline');
    } finally {
      await db.delete(rides).where(eq(rides.id, rideForRow!.id));
    }
  });
});
