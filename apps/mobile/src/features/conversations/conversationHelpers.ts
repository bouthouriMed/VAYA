import type { Conversation, ConversationMessage } from '../../state/api';
import type { TFunction } from 'i18next';
import { formatDaySectionLabel } from './inboxHelpers';

/** A message renders right-aligned (own) vs left-aligned (other party) —
 *  the one piece of chat-bubble logic that has to be correct regardless of
 *  which of driver/rider is viewing the screen. */
export function isOwnMessage(message: ConversationMessage, currentUserId: string): boolean {
  return message.senderUserId === currentUserId;
}

/** Sending is only ever allowed while the conversation is still `open` —
 *  mirrors the server's own check (conversations.service.ts's sendMessage)
 *  so the UI can disable the composer proactively instead of only
 *  discovering the 409 after a failed attempt. Undefined conversation
 *  (still loading) is treated as not-sendable, never optimistically open. */
export function canSendMessage(conversation: Conversation | undefined): boolean {
  return conversation?.status === 'open';
}

/** De-dupes and time-sorts messages across successive polling responses —
 *  a poll tick can legitimately return overlapping ids with the previous
 *  one (e.g. the client's own just-sent message already present locally). */
export function mergeAndSortMessages(
  existing: ConversationMessage[],
  incoming: ConversationMessage[],
): ConversationMessage[] {
  const byId = new Map<string, ConversationMessage>();
  for (const message of existing) byId.set(message.id, message);
  for (const message of incoming) byId.set(message.id, message);
  return Array.from(byId.values()).sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
  );
}

/** Locale-aware timestamp for a message bubble — same
 *  today-vs-older split notifications/index.tsx's formatWhen already uses. */
export function formatMessageTimestamp(iso: string, locale: string = 'en'): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return `${date.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} · ${time}`;
}

export interface SubmitMessageDeps {
  sendMessage: (body: string) => Promise<unknown>;
  trackEvent: (name: string, payload?: Record<string, string | number | boolean | null>) => void;
  role: 'driver' | 'rider';
}

/** Trip statuses that mean the shared ride is happening right now. */
const LIVE_TRIP_STATUSES = new Set(['driver_approaching', 'pickup', 'active', 'arriving']);
/** Trip statuses that permanently end the trip — same set the server's
 *  conversation-closing rule derives from (trips.status is re-derived live,
 *  so this mirrors what GET /conversations already returned). */
const TERMINAL_TRIP_STATUSES = new Set(['completed', 'no_show', 'cancelled']);

export interface TripContext {
  label: string;
  /** True only while the trip is actively happening — drives the pulsing
   *  status dot in the chat header's context bar. */
  isLive: boolean;
}

/**
 * The chat header's persistent trip-context label, derived ONLY from real
 * state the server returned — never a fabricated "confirmed" when the
 * underlying booking/trip says otherwise. Was hardcoded French regardless
 * of the app's own en/fr/ar locale (a real bug — every other label on this
 * screen goes through `t()`); now takes `t` like formatInboxTimestamp/
 * roleLabel already do elsewhere in this same feature.
 */
export function getTripContext(conversation: Conversation, t: TFunction): TripContext {
  if (
    conversation.status === 'closed' ||
    (conversation.tripStatus !== null && TERMINAL_TRIP_STATUSES.has(conversation.tripStatus))
  ) {
    return { label: t('booking:conversation.tripCompleted'), isLive: false };
  }
  if (conversation.tripStatus !== null && LIVE_TRIP_STATUSES.has(conversation.tripStatus)) {
    return { label: t('booking:conversation.tripActive'), isLive: true };
  }
  return { label: t('booking:conversation.tripUpcoming'), isLive: false };
}

export interface MessageDayGroup {
  label: string;
  messages: ConversationMessage[];
}

/**
 * Splits a time-sorted message list into calendar-day groups so the screen
 * can render Stitch's date-pill separators. Assumes `messages` are already
 * sorted ascending (listConversationMessages returns them that way).
 */
export function groupMessagesByDay(
  messages: ConversationMessage[],
  t: TFunction,
  now: Date = new Date(),
): MessageDayGroup[] {
  const groups: MessageDayGroup[] = [];
  for (const message of messages) {
    const label = formatDaySectionLabel(message.createdAt, t, now);
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.messages.push(message);
    } else {
      groups.push({ label, messages: [message] });
    }
  }
  return groups;
}

/**
 * The composer's submit orchestration, pulled out of the screen component
 * so it's testable without a React Native rendering harness (same
 * discipline as registerForPushNotifications.ts's requestPushPermissionAndRegister
 * — this repo still has no component-render test setup, see Phase 7 notes
 * in docs/roadmap/README.md). Trims and rejects empty/whitespace-only
 * input client-side (the server independently re-validates length/content —
 * this is a UX nicety, not the enforcement point) and fires the
 * `message_sent` analytics event (per role) only after a real send
 * succeeds.
 */
export async function submitMessage(body: string, deps: SubmitMessageDeps): Promise<boolean> {
  const trimmed = body.trim();
  if (!trimmed) return false;

  await deps.sendMessage(trimmed);
  deps.trackEvent('message_sent', { role: deps.role });
  return true;
}
