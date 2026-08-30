import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { getDatabase, closeDatabase } from '../../../lib/database.js';
import {
  users,
  driverProfiles,
  vehicles,
  rides,
  conversations,
  trips,
} from '../../../db/schema/index.js';
import { createBooking, acceptBooking, cancelBooking } from '../../bookings/bookings.service.js';
import { getConversationByBookingId, listMessages, sendMessage } from '../conversations.service.js';
import { ConflictError, ForbiddenError } from '../../../lib/errors.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * Full real-Postgres lifecycle for Phase 8 (docs/roadmap/phase-08-messaging.md):
 * booking accepted -> conversation auto-created -> both parties exchange
 * messages -> trip reaches a terminal state -> conversation becomes
 * read-only (send rejected with a clear error, history still readable).
 * Same discipline as bookings-notifications.integration.test.ts: exercises
 * the real DB, not a mock, because the behavior under test (a DB-unique
 * bookingId constraint, a live cross-table trip-status check) only means
 * something against a real Postgres instance.
 */
describe('conversations — full lifecycle (Phase 8)', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderId: string;
  let outsiderId: string;
  let rideId: string;
  let cancelledRideId: string;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}7`, fullName: 'Conv Test Driver' })
      .returning();
    driverUserId = driverUser!.id;

    const [driverProfile] = await db
      .insert(driverProfiles)
      .values({ userId: driverUserId, verificationStatus: 'approved' })
      .returning();
    driverProfileId = driverProfile!.id;

    const [vehicle] = await db
      .insert(vehicles)
      .values({
        driverProfileId,
        make: 'Test',
        model: 'Car',
        color: 'Green',
        plateNumber: `CONV-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [rider] = await db
      .insert(users)
      .values({ phone: `+216${base}8`, fullName: 'Conv Test Rider' })
      .returning();
    riderId = rider!.id;

    const [outsider] = await db
      .insert(users)
      .values({ phone: `+216${base}9`, fullName: 'Conv Test Outsider' })
      .returning();
    outsiderId = outsider!.id;

    const [ride] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Conv Origin',
        originLat: 36.8,
        originLng: 10.18,
        destinationLabel: 'Conv Dest',
        destinationLat: 36.85,
        destinationLng: 10.2,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    rideId = ride!.id;

    const [cancelledRide] = await db
      .insert(rides)
      .values({
        driverProfileId,
        vehicleId,
        originLabel: 'Conv Origin 2',
        originLat: 36.9,
        originLng: 10.28,
        destinationLabel: 'Conv Dest 2',
        destinationLat: 36.95,
        destinationLng: 10.3,
        departureAt: new Date(Date.now() + 3_600_000),
        seatsTotal: 3,
        seatsAvailable: 3,
        contributionPerSeat: 5,
        status: 'published',
      })
      .returning();
    cancelledRideId = cancelledRide!.id;
  }, 30_000);

  afterAll(async () => {
    await db.delete(rides).where(eq(rides.driverProfileId, driverProfileId));
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderId));
    await db.delete(users).where(eq(users.id, outsiderId));
    await closeQueue();
    await closeDatabase();
  });

  it('runs the full accept -> message -> complete -> read-only lifecycle', async () => {
    const booking = await createBooking(db, rideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Conv pickup', lat: 36.8, lng: 10.18 },
    });

    // No conversation exists before acceptance.
    await expect(getConversationByBookingId(db, booking.id, riderId)).rejects.toThrow();

    await acceptBooking(db, booking.id, driverUserId);

    const conversation = await getConversationByBookingId(db, booking.id, riderId);
    expect(conversation.status).toBe('open');

    // One conversation per booking — the unique constraint on
    // conversations.bookingId, verified directly against Postgres.
    const rows = await db.query.conversations.findMany({
      where: eq(conversations.bookingId, booking.id),
    });
    expect(rows).toHaveLength(1);

    // A third party — not the rider, not the driver — is rejected on every
    // access, not just at creation.
    await expect(
      getConversationByBookingId(db, booking.id, outsiderId),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      sendMessage(db, conversation.id, outsiderId, { body: 'snooping' }),
    ).rejects.toBeInstanceOf(ForbiddenError);

    const riderMessage = await sendMessage(db, conversation.id, riderId, {
      body: 'Bonjour, je serai là à 8h.',
    });
    expect(riderMessage.senderUserId).toBe(riderId);

    const driverMessage = await sendMessage(db, conversation.id, driverUserId, {
      body: "D'accord, à tout à l'heure.",
    });
    expect(driverMessage.senderUserId).toBe(driverUserId);

    const messages = await listMessages(db, conversation.id, riderId);
    expect(messages.map((m) => m.body)).toEqual([
      'Bonjour, je serai là à 8h.',
      "D'accord, à tout à l'heure.",
    ]);

    // Simulate the trip reaching a terminal state — there is no
    // trip-completion endpoint in this codebase yet (a real, separate gap,
    // not built as a side effect of this phase), so this reaches into the
    // trips table directly the way a future completion endpoint eventually
    // will. The read-only enforcement below is what actually matters: it's
    // derived live from trips.status, not from a hook that has to remember
    // to fire.
    await db.update(trips).set({ status: 'completed' }).where(eq(trips.bookingId, booking.id));

    await expect(
      sendMessage(db, conversation.id, riderId, { body: 'trop tard' }),
    ).rejects.toBeInstanceOf(ConflictError);

    // History remains readable even though writes are now rejected.
    const messagesAfterCompletion = await listMessages(db, conversation.id, riderId);
    expect(messagesAfterCompletion).toHaveLength(2);

    const closedConversation = await getConversationByBookingId(db, booking.id, riderId);
    expect(closedConversation.status).toBe('closed');
  });

  it('closes the conversation immediately when the booking is cancelled', async () => {
    const booking = await createBooking(db, cancelledRideId, riderId, {
      seatsRequested: 1,
      pickup: { label: 'Conv pickup 2', lat: 36.9, lng: 10.28 },
    });
    await acceptBooking(db, booking.id, driverUserId);

    const conversation = await getConversationByBookingId(db, booking.id, riderId);
    expect(conversation.status).toBe('open');

    await cancelBooking(db, booking.id, driverUserId, 'change_of_plans');

    const [row] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.bookingId, booking.id));
    expect(row!.status).toBe('closed');

    await expect(
      sendMessage(db, conversation.id, riderId, { body: 'still there?' }),
    ).rejects.toBeInstanceOf(ConflictError);
  });
});
