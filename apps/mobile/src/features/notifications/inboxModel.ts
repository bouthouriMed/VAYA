import type { AppNotification, NotificationEventType } from '../../state/api';

export type InboxFilter = 'all' | 'requests' | 'trips' | 'messages';

const MESSAGE_TYPES: NotificationEventType[] = ['message_received'];
const REQUEST_TYPES: NotificationEventType[] = ['booking_requested'];

/** Which filter chip an event belongs to (besides "all"). Account events
 *  (verification, ratings) only show under "all". */
export function inboxCategoryOf(type: NotificationEventType): InboxFilter | null {
  if (REQUEST_TYPES.includes(type)) return 'requests';
  if (MESSAGE_TYPES.includes(type)) return 'messages';
  if (type.startsWith('booking_') || type.startsWith('trip_') || type.startsWith('recurring_') || type === 'demand_signal_matched') {
    return 'trips';
  }
  return null;
}

/** How long a seat request without a stored deadline (rows written before
 *  `expiresAt` was added to the payload) still counts as possibly open. */
const LEGACY_REQUEST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** A seat request the driver may still have to answer — the server's real
 *  deadline not yet passed. The screen still checks the booking's real
 *  status before offering Accept/Decline. */
export function isOpenRequest(notification: AppNotification, now: Date): boolean {
  if (notification.type !== 'booking_requested') return false;
  const expiresAt = notification.payload.expiresAt;
  if (typeof expiresAt === 'string') return new Date(expiresAt).getTime() > now.getTime();
  return now.getTime() - new Date(notification.createdAt).getTime() < LEGACY_REQUEST_WINDOW_MS;
}

export interface InboxSection {
  /** ISO day key (yyyy-mm-dd, local time) — the screen formats the label. */
  dayKey: string;
  items: AppNotification[];
}

export interface InboxModel {
  /** Seat requests still open, soonest deadline first — shown on top. */
  openRequests: AppNotification[];
  /** Everything else, newest first, grouped by day. */
  sections: InboxSection[];
  counts: Record<InboxFilter, number>;
  unreadCount: number;
}

function dayKeyOf(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function deadlineOf(notification: AppNotification): number {
  const expiresAt = notification.payload.expiresAt;
  return typeof expiresAt === 'string' ? new Date(expiresAt).getTime() : Number.POSITIVE_INFINITY;
}

export function buildInbox(notifications: AppNotification[], filter: InboxFilter, now: Date): InboxModel {
  const newestFirst = [...notifications].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const counts: Record<InboxFilter, number> = { all: newestFirst.length, requests: 0, trips: 0, messages: 0 };
  for (const n of newestFirst) {
    const category = inboxCategoryOf(n.type);
    if (category) counts[category] += 1;
  }

  const visible = filter === 'all' ? newestFirst : newestFirst.filter((n) => inboxCategoryOf(n.type) === filter);
  const openRequests = visible.filter((n) => isOpenRequest(n, now)).sort((a, b) => deadlineOf(a) - deadlineOf(b));
  const open = new Set(openRequests.map((n) => n.id));

  const sections: InboxSection[] = [];
  for (const n of visible) {
    if (open.has(n.id)) continue;
    const dayKey = dayKeyOf(n.createdAt);
    const last = sections[sections.length - 1];
    if (last && last.dayKey === dayKey) last.items.push(n);
    else sections.push({ dayKey, items: [n] });
  }

  return {
    openRequests,
    sections,
    counts,
    unreadCount: newestFirst.filter((n) => !n.readAt).length,
  };
}

/** Minutes left until `expiresAt` and the share of the response window
 *  still left — what the countdown ring draws. Null without a deadline. */
export function responseTimeLeft(
  notification: AppNotification,
  now: Date,
): { minutes: number; remaining: number } | null {
  const expiresAt = notification.payload.expiresAt;
  if (typeof expiresAt !== 'string') return null;
  const end = new Date(expiresAt).getTime();
  const start = new Date(notification.createdAt).getTime();
  const left = Math.max(0, end - now.getTime());
  const window = Math.max(1, end - start);
  return { minutes: Math.ceil(left / 60_000), remaining: Math.min(1, left / window) };
}
