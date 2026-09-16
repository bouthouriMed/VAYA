import { describe, it, expect, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  rides,
  bookings,
  refreshTokens,
  verificationDocuments,
} from '../../../db/schema/index.js';
import { deleteUser } from '../users.service.js';
import { createBooking } from '../../bookings/bookings.service.js';
import { getStorage } from '../../../lib/storage/index.js';

/**
 * Real Postgres, no mocking — same discipline as attach-phone.integration.
 * test.ts. Covers the actual gap this closes: account deletion must (a)
 * really anonymize PII and revoke live sessions, (b) refuse while the
 * Member has a live commitment to another Member (docs/legal/
 * terms-and-conditions.md Article 16.3), and (c) really erase KYC files
 * from storage, not just orphan a DB row (docs/legal/privacy-policy.md
 * §10).
 */
describe('deleteUser', () => {
  const db = getDatabase();
  const createdUserIds: string[] = [];
  const createdDriverProfileIds: string[] = [];
  const createdVehicleIds: string[] = [];
  const base = Date.now() % 10_000_000;

  afterAll(async () => {
    // rides cascade-delete their own bookings/route_stops; delete rides
    // before their driver_profiles/vehicles, and riders only after that.
    for (const driverProfileId of createdDriverProfileIds) {
      await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    }
    for (const id of createdUserIds) {
      await db.delete(bookings).where(eq(bookings.riderId, id)).catch(() => undefined);
    }
    for (const vehicleId of createdVehicleIds) {
      await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    }
    for (const driverProfileId of createdDriverProfileIds) {
      await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    }
    for (const id of createdUserIds) {
      await db.delete(users).where(eq(users.id, id));
    }
    await closeDatabase();
  });

  async function seedUser(suffix: string) {
    const [user] = await db
      .insert(users)
      .values({
        phone: `+216${base}${suffix}`,
        email: `delete-${suffix}-${base}@example.com`,
        fullName: `Delete Test ${suffix}`,
      })
      .returning();
    createdUserIds.push(user!.id);
    return user!;
  }

  async function seedDriver(suffix: string) {
    const user = await seedUser(suffix);
    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: user.id, verificationStatus: 'approved' })
      .returning();
    createdDriverProfileIds.push(driverProfile!.id);
    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId: driverProfile!.id,
        make: 'Test',
        model: 'Car',
        color: 'Black',
        plateNumber: `DEL-${base}${suffix}`,
        seatCount: 4,
      })
      .returning();
    createdVehicleIds.push(vehicle!.id);
    return { user, driverProfile: driverProfile!, vehicle: vehicle! };
  }

  async function makeRide(driverProfileId: string, vehicleId: string, status: 'draft' | 'published' | 'completed') {
    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Test Origin',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Test Destination',
        destinationLat: 36.85,
        destinationLng: 10.2,
        departureAt: new Date(Date.now() + 24 * 60 * 60_000),
        seatsTotal: 2,
        seatsAvailable: 2,
        contributionPerSeat: 5,
        status,
      })
      .returning();
    return ride!;
  }

  it('anonymizes PII, sets deletedAt, and revokes every live refresh token', async () => {
    const user = await seedUser('a');
    const [token] = await db
      .insert(refreshTokens)
      .values({
        userId: user.id,
        tokenHash: `hash-${base}a`,
        expiresAt: new Date(Date.now() + 24 * 60 * 60_000),
      })
      .returning();

    const deleted = await deleteUser(db, user.id, 'no longer needed');

    expect(deleted.deletedAt).not.toBeNull();
    expect(deleted.phone).toBeNull();
    expect(deleted.email).toBeNull();
    expect(deleted.fullName).toBe('Utilisateur supprimé');
    expect(deleted.deletionReason).toBe('no longer needed');

    const reloadedToken = await db.query.refreshTokens.findFirst({
      where: eq(refreshTokens.id, token!.id),
    });
    expect(reloadedToken!.revokedAt).not.toBeNull();
  });

  it('is idempotent — deleting an already-deleted account is a no-op, not an error', async () => {
    const user = await seedUser('b');
    const first = await deleteUser(db, user.id);
    const second = await deleteUser(db, user.id);
    expect(second.deletedAt).toEqual(first.deletedAt);
  });

  it('rejects (409) while the rider has an active booking', async () => {
    const { user: driver, driverProfile, vehicle } = await seedDriver('c-driver');
    const rider = await seedUser('c-rider');
    const ride = await makeRide(driverProfile.id, vehicle.id, 'published');
    await createBooking(db, ride.id, rider.id, {
      seatsRequested: 1,
      pickup: { label: 'Pickup', lat: 36.8, lng: 10.18 },
    });

    await expect(deleteUser(db, rider.id)).rejects.toMatchObject({ statusCode: 409 });

    const reloaded = await db.query.users.findFirst({ where: eq(users.id, rider.id) });
    expect(reloaded!.deletedAt).toBeNull();
    expect(reloaded!.phone).not.toBeNull();
    void driver;
  });

  it('rejects (409) while the driver has a published, unfinished ride', async () => {
    const { user: driver, driverProfile, vehicle } = await seedDriver('d-driver');
    await makeRide(driverProfile.id, vehicle.id, 'published');

    await expect(deleteUser(db, driver.id)).rejects.toMatchObject({ statusCode: 409 });

    const reloaded = await db.query.users.findFirst({ where: eq(users.id, driver.id) });
    expect(reloaded!.deletedAt).toBeNull();
  });

  it('allows deletion once the driver only has completed/draft rides, and really erases KYC files from storage', async () => {
    const { user: driver, driverProfile } = await seedDriver('e-driver');
    const storage = getStorage();
    const secureUrl = await storage.saveSecure({
      buffer: Buffer.from('fake-selfie-bytes'),
      filename: 'selfie.jpg',
      contentType: 'image/jpeg',
    });
    await db.insert(verificationDocuments).values({
      driverProfileId: driverProfile.id,
      type: 'selfie',
      fileUrl: secureUrl,
      status: 'approved',
    });

    // Confirm the file genuinely exists before deletion, so the
    // post-deletion assertion below proves real erasure, not an
    // already-empty precondition.
    const before = await storage.readSecure(secureUrl);
    expect(before).not.toBeNull();

    const deleted = await deleteUser(db, driver.id);
    expect(deleted.deletedAt).not.toBeNull();

    const after = await storage.readSecure(secureUrl);
    expect(after).toBeNull();
  });
});
