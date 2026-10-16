import { router } from 'expo-router';
import { useAppDispatch } from '../../state/store';
import {
  ensureSearchSession,
  resetSearch,
  setDesiredDepartureAt,
  setDestination,
  setOrigin,
  setPassengers,
  startSearch,
} from '../../state/searchSlice';
import { trackEvent } from '../../services/analytics/analytics';
import type { AgendaItem, BookingItem, SearchAgain } from './agenda';

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

/** Runs the same journey as a fresh search (pickup, drop-off, time,
 *  seats) and opens the results — "find another ride" in one tap. */
export function useSearchAgain(): (target: SearchAgain) => void {
  const dispatch = useAppDispatch();
  return (target) => {
    dispatch(resetSearch());
    dispatch(ensureSearchSession());
    dispatch(setOrigin({ label: target.origin.label, lat: target.origin.lat, lng: target.origin.lng }));
    dispatch(setDestination({ label: target.destination.label, lat: target.destination.lat, lng: target.destination.lng }));
    dispatch(setDesiredDepartureAt(target.departureAt ? target.departureAt.toISOString() : null));
    dispatch(setPassengers(target.passengers));
    dispatch(startSearch());
    trackEvent('trips_search_again', { passengers: target.passengers });
    router.push('/search/results');
  };
}
