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
import { createBooking, acceptBooking } from '../../bookings/bookings.service.js';
import {
  listConversations,
  getConversationByBookingId,
  sendMessage,
} from '../conversations.service.js';
import { closeQueue } from '../../../lib/queue.js';

/**
 * Real-Postgres coverage for the enriched conversation payloads the inbox
 * and chat screens render from (GET /conversations + GET
 * /conversations/:bookingId). Same discipline as the Phase 8 lifecycle
 * test beside it: party scoping and live trip-status derivation are only
 * meaningful against a real database, so nothing here is mocked.
 */
describe('conversations — inbox list + enriched summaries', () => {
  const db = getDatabase();
  let driverUserId: string;
  let driverProfileId: string;
  let vehicleId: string;
  let riderAId: string;
  let riderBId: string;
  let outsiderId: string;
  const cleanupRideIds: string[] = [];
  let bookingAId: string;
  let bookingBId: string;
  let conversationAId: string;
  let conversationBId: string;

  beforeAll(async () => {
    const base = Date.now() % 10_000_000;

    const [driverUser] = await db
      .insert(users)
      .values({ phone: `+216${base}1`, fullName: 'Inbox Test Driver' })
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
        color: 'White',
        plateNumber: `INBX-${base}`,
        seatCount: 4,
      })
      .returning();
    vehicleId = vehicle!.id;

    const [riderA] = await db
      .insert(users)
      .values({ phone: `+216${base}2`, fullName: 'Inbox Rider A' })
      .returning();
    riderAId = riderA!.id;

    const [riderB] = await db
      .insert(users)
      .values({ phone: `+216${base}3`, fullName: 'Inbox Rider B' })
      .returning();
    riderBId = riderB!.id;

    const [outsider] = await db
      .insert(users)
      .values({ phone: `+216${base}4`, fullName: 'Inbox Outsider' })
      .returning();
    outsiderId = outsider!.id;

    async function insertRide(
      originLabel: string,
      destinationLabel: string,
      destination: { lat: number; lng: number },
    ): Promise<string> {
      const [ride] = await db
        .insert(rides)
        .values({
          driverProfileId,
          vehicleId,
          originLabel,
          originLat: 36.8,
          originLng: 10.18,
          destinationLabel,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          departureAt: new Date(Date.now() + 3_600_000),
          seatsTotal: 3,
          seatsAvailable: 3,
          contributionPerSeat: 5,
          status: 'published',
        })
        .returning();
      cleanupRideIds.push(ride!.id);
      return ride!.id;
    }

    // Rider A books both rides; rider B books only ride A. All accepted ⇒
    // three conversations total: two visible to rider A / the driver, one
    // to rider B. Ride B's destination is deliberately several km away from
    // ride A's (not just a different label) — M-051/055/056's same-journey
    // grouping (journey-grouping.ts) would otherwise treat rider A's two
    // bookings as duplicate requests for the same journey (same rider, same
    // pickup, same ~time) and auto-supersede the second the moment the
    // first is accepted, which is real, spec-required behavior this fixture
    // must not accidentally trigger — these are meant to be two genuinely
    // different rides/conversations.
    const rideAId = await insertRide('Inbox Origin A', 'Inbox Dest A', { lat: 36.85, lng: 10.2 });
    const rideBId = await insertRide('Inbox Origin B', 'Inbox Dest B', { lat: 36.95, lng: 10.35 });

    bookingAId = (
      await createBooking(db, rideAId, riderAId, {
        seatsRequested: 1,
        pickup: { label: 'Inbox pickup A', lat: 36.8, lng: 10.18 },
      })
    ).id;
    bookingBId = (
      await createBooking(db, rideBId, riderAId, {
        seatsRequested: 1,
        pickup: { label: 'Inbox pickup B', lat: 36.8, lng: 10.18 },
      })
    ).id;
    const bookingCId = (
      await createBooking(db, rideAId, riderBId, {
        seatsRequested: 1,
        pickup: { label: 'Inbox pickup C', lat: 36.81, lng: 10.19 },
      })
    ).id;

    await acceptBooking(db, bookingAId, driverUserId);
    await acceptBooking(db, bookingBId, driverUserId);
    await acceptBooking(db, bookingCId, driverUserId);
    const [convA] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.bookingId, bookingAId));
    const [convB] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.bookingId, bookingBId));
    conversationAId = convA!.id;
    conversationBId = convB!.id;
  }, 30_000);

  afterAll(async () => {
    for (const rideId of cleanupRideIds) {
      await db.delete(rides).where(eq(rides.id, rideId));
    }
    await db.delete(vehicles).where(eq(vehicles.id, vehicleId));
    await db.delete(driverProfiles).where(eq(driverProfiles.id, driverProfileId));
    await db.delete(users).where(eq(users.id, driverUserId));
    await db.delete(users).where(eq(users.id, riderAId));
    await db.delete(users).where(eq(users.id, riderBId));
    await db.delete(users).where(eq(users.id, outsiderId));
    await closeQueue();
    await closeDatabase();
  });

  it('lists only the requesting party’s conversations, rider-side enriched', async () => {
    const summaries = await listConversations(db, riderAId);
    expect(summaries).toHaveLength(2);

    for (const summary of summaries) {
      expect(summary.viewerRole).toBe('rider');
      expect(summary.otherPartyRole).toBe('driver');
      expect(summary.otherParty.fullName).toBe('Inbox Test Driver');
      expect(summary.isOtherPartyVerified).toBe(true); // approved verificationStatus
      expect(summary.tripStatus).toBe('scheduled'); // trip auto-created at acceptance
      expect(summary.status).toBe('open');
      expect(summary.lastMessage).toBeNull(); // nothing sent yet
      if (summary.bookingId === bookingAId) {
        expect(summary.originLabel).toBe('Inbox Origin A');
        expect(summary.destinationLabel).toBe('Inbox Dest A');
      }
    }
    expect(summaries.map((s) => s.bookingId).sort()).toEqual([bookingAId, bookingBId].sort());

    // The second rider sees exactly their one conversation.
    const riderBSummaries = await listConversations(db, riderBId);
    expect(riderBSummaries).toHaveLength(1);
    expect(riderBSummaries[0]!.otherParty.fullName).toBe('Inbox Test Driver');

    // An uninvolved user sees nothing — scoping happens in SQL, not after.
    expect(await listConversations(db, outsiderId)).toEqual([]);
  });

  it('mirrors the same conversation from the driver’s side', async () => {
    const summaries = await listConversations(db, driverUserId);
    expect(summaries).toHaveLength(3); // both riders × ride A + rider A × ride B

    const forRiderAOnRideA = summaries.find(
      (s) => s.bookingId === bookingAId && s.otherParty.fullName === 'Inbox Rider A',
    );
    expect(forRiderAOnRideA).toBeDefined();
    expect(forRiderAOnRideA!.viewerRole).toBe('driver');
    expect(forRiderAOnRideA!.otherPartyRole).toBe('rider');
    expect(forRiderAOnRideA!.isOtherPartyVerified).toBe(false); // riders carry no verification
    expect(forRiderAOnRideA!.originLabel).toBe('Inbox Origin A');

    const single = await getConversationByBookingId(db, bookingBId, driverUserId);
    expect(single.viewerRole).toBe('driver');
    expect(single.otherParty.fullName).toBe('Inbox Rider A');
  });

  it('orders by activity and surfaces each thread’s latest message', async () => {
    // Send on B first, then A — so A is the most recently updated thread.
    await sendMessage(db, conversationBId, riderAId, { body: 'première' });
    await sendMessage(db, conversationBId, driverUserId, { body: 'réponse B' });
    await sendMessage(db, conversationAId, riderAId, { body: 'message le plus récent' });

    const summaries = await listConversations(db, riderAId);
    expect(summaries[0]!.id).toBe(conversationAId);
    expect(summaries[0]!.lastMessage?.body).toBe('message le plus récent');
    expect(summaries[0]!.lastMessage?.senderUserId).toBe(riderAId);

    const summaryB = summaries.find((s) => s.id === conversationBId)!;
    expect(summaryB.lastMessage?.body).toBe('réponse B');
    expect(summaryB.lastMessage?.senderUserId).toBe(driverUserId);
  });

  it('derives closed status live from the trip, not the cached column', async () => {
    // Complete booking B's trip directly — the cached conversations.status
    // stays 'open' until some read path syncs it, but the summary must
    // already report closed because the trip itself is terminal.
    await db.update(trips).set({ status: 'completed' }).where(eq(trips.bookingId, bookingBId));

    const [cachedRow] = await db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationBId));

    const summaries = await listConversations(db, riderAId);
    const summaryB = summaries.find((s) => s.id === conversationBId)!;
    expect(cachedRow!.status).toBe('open');
    expect(summaryB.status).toBe('closed');
  });
});
