import type { BookingStatus } from '../booking/booking-status';

/**
 * Who may write next in a booking's conversation.
 *
 * - `open`: the viewer can send a message.
 * - `awaiting_reply`: a passenger whose request isn't accepted yet has
 *   already sent a message the driver hasn't answered — one message per
 *   driver reply until the request is accepted, so a pending request can't
 *   turn into a stream of messages the driver never asked for.
 * - `closed`: no trip is coming (declined, expired, cancelled…) or the trip
 *   is over — read-only for both.
 *
 * The driver can always answer a live conversation. Once the booking is
 * accepted, both write freely.
 */
export type MessageTurn = 'open' | 'awaiting_reply' | 'closed';

export interface MessageTurnInput {
  viewerRole: 'driver' | 'rider';
  bookingStatus: BookingStatus;
  /** Conversation already closed (booking resolved, or trip terminal). */
  closed: boolean;
  /** Role of whoever sent the latest message, or null when there is none. */
  lastSenderRole: 'driver' | 'rider' | null;
}

/** Max length of the one message a passenger can attach to a request. */
export const REQUEST_MESSAGE_MAX_LENGTH = 500;

export function resolveMessageTurn(input: MessageTurnInput): MessageTurn {
  if (input.closed) return 'closed';
  if (input.viewerRole === 'rider' && input.bookingStatus === 'pending' && input.lastSenderRole === 'rider') {
    return 'awaiting_reply';
  }
  return 'open';
}
