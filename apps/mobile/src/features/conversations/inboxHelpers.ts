/**
 * Pure presentation logic for the Messages inbox tab — no React, no DB,
 * no network. Everything here is deterministic given its inputs so it can
 * be unit-tested without mocks (the same discipline as
 * recurringHelpers/rankStopsByWalkDistance).
 */

export interface InboxConversation {
  id: string;
  bookingId: string;
  status: 'open' | 'closed';
  updatedAt: string;
  viewerRole: 'driver' | 'rider';
  otherParty: { id: string; fullName: string; avatarUrl: string | null };
  otherPartyRole: 'driver' | 'rider';
  isOtherPartyVerified: boolean;
  originLabel: string;
  destinationLabel: string;
  departureAt: string;
  tripStatus: string | null;
  lastMessage: { body: string; createdAt: string; senderUserId: string } | null;
  hasUnread: boolean;
}

export type InboxFilter = 'all' | 'upcoming' | 'active' | 'past';

/** Trip statuses that mean "the shared ride is happening right now". */
const ACTIVE_TRIP_STATUSES = new Set(['driver_approaching', 'pickup', 'active', 'arriving']);
/** Trip statuses that permanently end a conversation/trip. */
const TERMINAL_TRIP_STATUSES = new Set(['completed', 'no_show', 'cancelled']);

function isPast(conversation: InboxConversation, now: Date): boolean {
  if (
    conversation.status === 'closed' ||
    (conversation.tripStatus !== null && TERMINAL_TRIP_STATUSES.has(conversation.tripStatus))
  ) {
    return true;
  }
  return new Date(conversation.departureAt).getTime() < now.getTime();
}

/**
 * Filters the raw server list into one of the four Stitch filter pills.
 * The buckets are mutually exclusive and total (every conversation lands
 * in exactly one of upcoming/active/past) so switching filters never
 * hides a thread from all views at once.
 */
export function filterConversations(
  conversations: InboxConversation[],
  filter: InboxFilter,
  now: Date = new Date(),
): InboxConversation[] {
  if (filter === 'all') return conversations;
  return conversations.filter((conversation) => {
    if (isPast(conversation, now)) return filter === 'past';
    if (
      conversation.tripStatus !== null &&
      ACTIVE_TRIP_STATUSES.has(conversation.tripStatus)
    ) {
      return filter === 'active';
    }
    return filter === 'upcoming';
  });
}

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/**
 * Row timestamp: clock time for today ("10:42"), "Hier" for yesterday,
 * a short date ("12 janv.") within the year, full date beyond that —
 * mirroring the mockup's time/day/weekday progression without ever
 * inventing a relative phrase the data can't back.
 */
export function formatInboxTimestamp(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameCalendarDay(date, now)) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  if (isSameCalendarDay(date, yesterday)) return 'Hier';

  const sameYear = date.getFullYear() === now.getFullYear();
  return date.toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    ...(sameYear ? {} : { year: 'numeric' }),
  });
}

/** Section header above each day bucket ("Aujourd'hui", "Hier", dates). */
export function formatDaySectionLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);

  if (isSameCalendarDay(date, now)) return "Aujourd'hui";
  if (isSameCalendarDay(date, yesterday)) return 'Hier';
  return date.toLocaleDateString('fr-FR', {
    weekday: 'short',
    day: 'numeric',
    month: 'long',
  });
}

export interface InboxSection {
  label: string;
  conversations: InboxConversation[];
}

/**
 * Groups an already-sorted (newest first) list into day sections by the
 * thread's last activity — the mockup's sticky "Aujourd'hui"/"Passés"
 * structure, generalized to real dates instead of two hardcoded buckets.
 */
export function groupConversationsByDay(
  conversations: InboxConversation[],
  now: Date = new Date(),
): InboxSection[] {
  const sections: InboxSection[] = [];
  for (const conversation of conversations) {
    const activityIso = conversation.lastMessage?.createdAt ?? conversation.updatedAt;
    const label = formatDaySectionLabel(activityIso, now);
    const last = sections[sections.length - 1];
    if (last && last.label === label) {
      last.conversations.push(conversation);
    } else {
      sections.push({ label, conversations: [conversation] });
    }
  }
  return sections;
}

/** Neutral role label for the row's context line — no gender guessing. */
export function roleLabel(role: 'driver' | 'rider'): string {
  return role === 'driver' ? 'Conducteur' : 'Passager';
}

/** Short departure-time label for an inbox row's meta line — clock time
 *  today, "Demain" tomorrow, a short date beyond that. Mirrors
 *  formatInboxTimestamp's day logic but is forward-looking (a departure
 *  is usually in the future, not the past a message timestamp implies). */
export function formatDepartureLabel(iso: string, now: Date = new Date()): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';

  if (isSameCalendarDay(date, now)) {
    return date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  }
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  if (isSameCalendarDay(date, tomorrow)) return 'Demain';

  return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' });
}

/** Client-side text filter over the already-fetched inbox — matches the
 *  other party's name or the route labels. No backend search endpoint
 *  exists (nor is one needed): the inbox is never large enough per user
 *  to justify one, so this stays a pure, instant, offline filter. */
export function searchConversations(
  conversations: InboxConversation[],
  query: string,
): InboxConversation[] {
  const q = query.trim().toLowerCase();
  if (!q) return conversations;
  return conversations.filter((c) =>
    [c.otherParty.fullName, c.originLabel, c.destinationLabel].some((field) =>
      field.toLowerCase().includes(q),
    ),
  );
}
