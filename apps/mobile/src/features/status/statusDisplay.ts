import type { TFunction } from 'i18next';
import { deriveBookingPhase, type BookingPhase, type RideStatus, type TripStatus } from '@vaya/domain';
import type { Booking } from '../../state/api';

/** Badge tones — the same set the design system's `Badge` accepts. */
export type StatusTone = 'default' | 'success' | 'warning' | 'error' | 'info';

export interface StatusDisplay {
  label: string;
  tone: StatusTone;
}

const BOOKING_PHASE_TONE: Record<BookingPhase, StatusTone> = {
  awaiting_response: 'warning',
  confirmed: 'success',
  in_progress: 'info',
  completed: 'default',
  declined: 'error',
  cancelled_by_rider: 'default',
  cancelled_by_driver: 'error',
  expired: 'default',
  superseded: 'default',
  no_show: 'error',
};

const RIDE_STATUS_TONE: Record<RideStatus, StatusTone> = {
  draft: 'default',
  published: 'success',
  full: 'info',
  in_progress: 'info',
  completed: 'default',
  cancelled: 'error',
  expired: 'default',
};

/**
 * The one label + tone for a booking, on every screen (trips list, booking
 * detail, conversation header). The phase itself comes from
 * `@vaya/domain`'s `deriveBookingPhase`, so an accepted booking whose trip
 * hasn't started reads "Confirmée" everywhere instead of "Accepté" on one
 * screen, "En cours" on another and "Trajet à venir" on a third.
 */
export function bookingStatusDisplay(
  t: TFunction,
  status: Booking['status'],
  context: { rideStatus?: RideStatus | null; tripStatus?: TripStatus | null } = {},
): StatusDisplay & { phase: BookingPhase } {
  const phase = deriveBookingPhase(status, context);
  return { phase, label: t(`booking:phase.${phase}`), tone: BOOKING_PHASE_TONE[phase] };
}

/** A `draft` ride flagged `publishOnVerificationAt` is not a draft to the
 *  driver — they tapped "Publier" and it goes live once they're verified —
 *  so it reads "En attente de vérification", never "Brouillon". */
export function rideStatusDisplay(
  t: TFunction,
  status: RideStatus,
  context: { publishOnVerificationAt?: string | null } = {},
): StatusDisplay {
  if (status === 'draft' && context.publishOnVerificationAt) {
    return { label: t('booking:ridePhase.awaitingVerification'), tone: 'warning' };
  }
  return { label: t(`booking:ridePhase.${status}`), tone: RIDE_STATUS_TONE[status] };
}
