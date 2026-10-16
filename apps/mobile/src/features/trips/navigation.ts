import { router } from 'expo-router';
import type { AgendaItem, BookingItem } from './agenda';

/** Where each trip opens from the trips tab — one place, so the top card,
 *  the to-do rows and the agenda rows can never disagree. */

export function openDrive(rideId: string): void {
  router.push({ pathname: '/driver/rides/[rideId]', params: { rideId } });
}

export function openBooking(bookingId: string): void {
  router.push({ pathname: '/bookings/[bookingId]', params: { bookingId } });
}

export function openConversation(bookingId: string): void {
  router.push({ pathname: '/conversations/[bookingId]', params: { bookingId } });
}

export function openLiveTracking(item: BookingItem): void {
  const ride = item.booking.ride;
  router.push({
    pathname: '/bookings/live',
    params: {
      bookingId: item.booking.id,
      ...(ride?.driverFullName ? { driverName: ride.driverFullName } : {}),
      price: String(item.booking.contributionTotal),
      destinationLabel: item.destinationLabel,
    },
  });
}

/** A live reservation opens straight onto the tracking screen. */
export function openAgendaItem(item: AgendaItem): void {
  if (item.role === 'driver') {
    openDrive(item.rideId);
    return;
  }
  if (item.isLive) {
    openLiveTracking(item);
    return;
  }
  openBooking(item.booking.id);
}
