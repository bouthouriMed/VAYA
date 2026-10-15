import { describe, it, expect } from 'vitest';
import { buildInbox, inboxCategoryOf, isOpenRequest, responseTimeLeft } from '../inboxModel';
import type { AppNotification, NotificationEventType } from '../../../state/api';

const NOW = new Date('2026-10-15T18:40:00');
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString();
const inMinutes = (m: number) => new Date(NOW.getTime() + m * 60_000).toISOString();

function n(id: string, type: NotificationEventType, createdAt: string, payload: Record<string, unknown> = {}, read = false): AppNotification {
  return { id, userId: 'u1', type, payload, readAt: read ? createdAt : null, createdAt, updatedAt: createdAt };
}

describe('buildInbox', () => {
  const items = [
    n('accepted', 'booking_accepted', minutesAgo(23)),
    n('req-old', 'booking_requested', minutesAgo(28), { expiresAt: minutesAgo(1) }, true),
    n('message', 'message_received', minutesAgo(8), {}, true),
    n('req-open', 'booking_requested', minutesAgo(5), { expiresAt: inMinutes(12) }),
    n('done', 'trip_completed', minutesAgo(60 * 24 * 7), {}, true),
  ];

  it('puts open requests on top and lists the rest newest first, by day', () => {
    const model = buildInbox(items, 'all', NOW);
    expect(model.openRequests.map((x) => x.id)).toEqual(['req-open']);
    expect(model.sections).toHaveLength(2);
    expect(model.sections[0]!.items.map((x) => x.id)).toEqual(['message', 'accepted', 'req-old']);
    expect(model.sections[1]!.items.map((x) => x.id)).toEqual(['done']);
  });

  it('counts per filter and unread overall', () => {
    const model = buildInbox(items, 'all', NOW);
    expect(model.counts).toEqual({ all: 5, requests: 2, trips: 2, messages: 1 });
    expect(model.unreadCount).toBe(2);
  });

  it('filters to one category', () => {
    const model = buildInbox(items, 'messages', NOW);
    expect(model.openRequests).toEqual([]);
    expect(model.sections.flatMap((s) => s.items.map((x) => x.id))).toEqual(['message']);
  });

  it('orders several open requests by the soonest deadline', () => {
    const model = buildInbox(
      [
        n('later', 'booking_requested', minutesAgo(2), { expiresAt: inMinutes(30) }),
        n('sooner', 'booking_requested', minutesAgo(9), { expiresAt: inMinutes(4) }),
      ],
      'all',
      NOW,
    );
    expect(model.openRequests.map((x) => x.id)).toEqual(['sooner', 'later']);
  });
});

describe('isOpenRequest', () => {
  it('treats an old row without a deadline as open for a day only', () => {
    expect(isOpenRequest(n('a', 'booking_requested', minutesAgo(60)), NOW)).toBe(true);
    expect(isOpenRequest(n('b', 'booking_requested', minutesAgo(60 * 25)), NOW)).toBe(false);
  });
});

describe('responseTimeLeft', () => {
  it('gives whole minutes left and the share of the window', () => {
    expect(responseTimeLeft(n('r', 'booking_requested', minutesAgo(5), { expiresAt: inMinutes(15) }), NOW)).toEqual({
      minutes: 15,
      remaining: 0.75,
    });
  });
});

describe('inboxCategoryOf', () => {
  it('groups trip and booking events under trips, account events nowhere', () => {
    expect(inboxCategoryOf('trip_arriving')).toBe('trips');
    expect(inboxCategoryOf('booking_cancelled')).toBe('trips');
    expect(inboxCategoryOf('verification_approved')).toBeNull();
  });
});
