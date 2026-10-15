import { and, desc, eq, ne } from 'drizzle-orm';
import { readablePlaceLabel, shortPlaceLabel } from '@vaya/domain';
import type { getDatabase } from '../../lib/database.js';
import { bookings, messages, recurringPatterns, rides, trips, users } from '../../db/schema/index.js';
import { getLogger } from '../../config/logger.js';
import {
  firstName,
  messagePreview,
  routeLabel,
  type NotificationContext,
  type NotificationLocale,
} from './notification-copy.js';

type Database = ReturnType<typeof getDatabase>;

export interface LoadedNotificationContext {
  locale: NotificationLocale;
  context: NotificationContext;
  /** Ids the app needs to open the right screen on tap. */
  link: { bookingId?: string; rideId?: string; role?: 'driver' | 'rider' };
}

const LOCALES: readonly NotificationLocale[] = ['fr', 'en', 'ar'];
const str = (v: unknown): string | undefined => (typeof v === 'string' && v ? v : undefined);

/**
 * Loads what a notification is about from the ids its payload already
 * carries (bookingId / tripId / rideId / patternId / conversationId), so the
 * copy can name who, which trip, when and where. One place, instead of
 * every dispatch site assembling its own partial payload. Best-effort: any
 * lookup failure yields an empty context — a notification is never dropped
 * because its context couldn't be loaded.
 */
export async function loadNotificationContext(
  db: Database,
  recipientUserId: string,
  payload: Record<string, unknown>,
): Promise<LoadedNotificationContext> {
  const recipient = await db.query.users.findFirst({ where: eq(users.id, recipientUserId) });
  const locale = LOCALES.includes(recipient?.locale as NotificationLocale)
    ? (recipient!.locale as NotificationLocale)
    : 'fr';

  try {
    const context: NotificationContext = {};
    const link: LoadedNotificationContext['link'] = {};

    let bookingId = str(payload.bookingId);
    const tripId = str(payload.tripId);
    if (!bookingId && tripId) {
      const trip = await db.query.trips.findFirst({ where: eq(trips.id, tripId) });
      bookingId = trip?.bookingId;
    }

    if (bookingId) {
      const booking = await db.query.bookings.findFirst({
        where: eq(bookings.id, bookingId),
        with: {
          rider: true,
          ride: { with: { driverProfile: { with: { user: true } }, vehicle: true } },
        },
      });
      if (booking) {
        const ride = booking.ride;
        const isRider = booking.riderId === recipientUserId;
        const isDriver = ride.driverProfile.userId === recipientUserId;
        context.role = isRider ? 'rider' : isDriver ? 'driver' : undefined;
        context.otherName = isRider ? firstName(ride.driverProfile.user.fullName) : firstName(booking.rider.fullName);
        const destinationLabel = booking.dropoffLabel ?? ride.destinationLabel;
        // A rider's trip is their own leg; a driver's is the whole ride.
        context.route = isRider
          ? routeLabel(booking.pickupLabel, destinationLabel)
          : routeLabel(ride.originLabel, ride.destinationLabel);
        context.destination = shortPlaceLabel(isRider ? destinationLabel : ride.destinationLabel);
        context.departureAt = ride.departureAt;
        context.meetingPoint = readablePlaceLabel(booking.pickupLabel);
        context.seats = booking.seatsRequested;
        context.pricePerSeat = ride.contributionPerSeat;
        context.seatsAvailable = ride.seatsAvailable;
        context.expiresAt = booking.expiresAt ?? undefined;
        if (isRider && ride.vehicle) {
          const v = ride.vehicle;
          context.vehicle = `${v.make} ${v.model}, ${v.color}${v.plateNumber ? ` · ${v.plateNumber}` : ''}`;
        }
        link.bookingId = booking.id;
        link.rideId = ride.id;
        link.role = context.role;
      }
    }

    const rideId = str(payload.rideId);
    if (!context.route && rideId) {
      const ride = await db.query.rides.findFirst({
        where: eq(rides.id, rideId),
        with: { driverProfile: { with: { user: true } } },
      });
      if (ride) {
        const isDriver = ride.driverProfile.userId === recipientUserId;
        context.role = isDriver ? 'driver' : context.role;
        context.otherName = context.otherName ?? (isDriver ? undefined : firstName(ride.driverProfile.user.fullName));
        context.route = routeLabel(ride.originLabel, ride.destinationLabel);
        context.destination = shortPlaceLabel(ride.destinationLabel);
        context.departureAt = ride.departureAt;
        context.pricePerSeat = ride.contributionPerSeat;
        context.seatsAvailable = ride.seatsAvailable;
        link.rideId = ride.id;
        link.role = context.role;
      }
    }

    const patternId = str(payload.patternId);
    if (!context.route && patternId) {
      const pattern = await db.query.recurringPatterns.findFirst({ where: eq(recurringPatterns.id, patternId) });
      if (pattern) context.route = routeLabel(pattern.originLabel, pattern.destinationLabel);
    }

    const conversationId = str(payload.conversationId);
    if (conversationId) {
      const latest = await db.query.messages.findFirst({
        where: and(eq(messages.conversationId, conversationId), ne(messages.senderUserId, recipientUserId)),
        orderBy: desc(messages.createdAt),
        with: { sender: true },
      });
      if (latest) {
        context.messagePreview = messagePreview(latest.body);
        context.otherName = firstName(latest.sender.fullName) ?? context.otherName;
      }
    }

    return { locale, context, link };
  } catch (err) {
    getLogger().warn({ err, recipientUserId }, 'Could not load notification context — sending without it');
    return { locale, context: {}, link: {} };
  }
}
