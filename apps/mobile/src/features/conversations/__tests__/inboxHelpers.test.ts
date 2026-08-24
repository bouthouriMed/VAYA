import { describe, it, expect } from 'vitest';
import {
  filterConversations,
  formatInboxTimestamp,
  formatDaySectionLabel,
  formatDepartureLabel,
  groupConversationsByDay,
  roleLabel,
  searchConversations,
  type InboxConversation,
} from '../inboxHelpers.js';

// Fixed reference point: Wednesday 2026-01-14, 10:42 local time.
const NOW = new Date(2026, 0, 14, 10, 42, 0);

function makeConversation(overrides: Partial<InboxConversation> = {}): InboxConversation {
  return {
    id: 'conv-1',
    bookingId: 'booking-1',
    status: 'open',
    updatedAt: new Date(2026, 0, 14, 9, 30).toISOString(),
    viewerRole: 'rider',
    otherParty: { id: 'driver-1', fullName: 'Sami Trabelsi', avatarUrl: null },
    otherPartyRole: 'driver',
    isOtherPartyVerified: true,
    originLabel: 'Tunis',
    destinationLabel: 'Sousse',
    departureAt: new Date(2026, 0, 15, 8, 0).toISOString(),
    tripStatus: null,
    lastMessage: {
      body: 'On se retrouve au arrêt de bus ?',
      createdAt: new Date(2026, 0, 14, 9, 30).toISOString(),
      senderUserId: 'driver-1',
    },
    hasUnread: false,
    ...overrides,
  };
}

describe('filterConversations', () => {
  const upcoming = makeConversation({ id: 'upcoming' });
  const active = makeConversation({
    id: 'active',
    tripStatus: 'pickup',
  });
  const past = makeConversation({
    id: 'past',
    status: 'closed',
    tripStatus: 'completed',
  });
  const list = [upcoming, active, past];

  it('returns everything untouched for the "all" filter', () => {
    expect(filterConversations(list, 'all', NOW)).toHaveLength(3);
  });

  it('buckets by live trip state, mutually exclusively', () => {
    expect(filterConversations(list, 'upcoming', NOW).map((c) => c.id)).toEqual(['upcoming']);
    expect(filterConversations(list, 'active', NOW).map((c) => c.id)).toEqual(['active']);
    expect(filterConversations(list, 'past', NOW).map((c) => c.id)).toEqual(['past']);
  });

  it('treats a departure already in the past as past even without a terminal trip', () => {
    const stale = makeConversation({
      id: 'stale',
      departureAt: new Date(2026, 0, 13, 8, 0).toISOString(),
    });
    expect(filterConversations([stale], 'past', NOW).map((c) => c.id)).toEqual(['stale']);
    expect(filterConversations([stale], 'upcoming', NOW)).toEqual([]);
  });

  it('keeps a future-departure conversation upcoming while its trip is still scheduled', () => {
    const scheduled = makeConversation({ id: 'sched', tripStatus: 'scheduled' });
    expect(filterConversations([scheduled], 'upcoming', NOW).map((c) => c.id)).toEqual(['sched']);
    expect(filterConversations([scheduled], 'active', NOW)).toEqual([]);
  });
});

describe('formatInboxTimestamp', () => {
  it('shows clock time for today', () => {
    expect(formatInboxTimestamp(new Date(2026, 0, 14, 9, 30).toISOString(), NOW)).toBe('09:30');
  });

  it('shows "Hier" for yesterday', () => {
    expect(formatInboxTimestamp(new Date(2026, 0, 13, 22, 5).toISOString(), NOW)).toBe('Hier');
  });

  it('shows a short date within the same year', () => {
    expect(formatInboxTimestamp(new Date(2026, 0, 3, 8, 0).toISOString(), NOW)).toBe('3 janv.');
  });

  it('includes the year once it differs from today’s', () => {
    expect(formatInboxTimestamp(new Date(2025, 11, 28, 8, 0).toISOString(), NOW)).toBe(
      '28 déc. 2025',
    );
  });

  it('degrades to empty string on an invalid timestamp rather than throwing', () => {
    expect(formatInboxTimestamp('not-a-date', NOW)).toBe('');
  });
});

describe('formatDaySectionLabel', () => {
  it("labels today's bucket", () => {
    expect(formatDaySectionLabel(NOW.toISOString(), NOW)).toBe("Aujourd'hui");
  });

  it('labels yesterday’s bucket', () => {
    expect(formatDaySectionLabel(new Date(2026, 0, 13, 23, 0).toISOString(), NOW)).toBe('Hier');
  });

  it('labels older buckets with weekday + date', () => {
    expect(formatDaySectionLabel(new Date(2026, 0, 5, 12, 0).toISOString(), NOW)).toContain('janv');
  });
});

describe('groupConversationsByDay', () => {
  it('groups consecutive threads sharing an activity day and splits distinct ones', () => {
    const grouped = groupConversationsByDay(
      [
        makeConversation({ id: 'a' }), // activity today
        makeConversation({ id: 'b' }), // activity today
        makeConversation({
          id: 'c',
          lastMessage: {
            body: 'ok',
            createdAt: new Date(2026, 0, 13, 20, 0).toISOString(),
            senderUserId: 'x',
          },
        }),
      ],
      NOW,
    );

    expect(grouped.map((section) => section.label)).toEqual(["Aujourd'hui", 'Hier']);
    expect(grouped[0]!.conversations.map((c) => c.id)).toEqual(['a', 'b']);
    expect(grouped[1]!.conversations.map((c) => c.id)).toEqual(['c']);
  });

  it('falls back to updatedAt when a thread has no message yet', () => {
    const silent = makeConversation({
      id: 'silent',
      lastMessage: null,
      updatedAt: new Date(2026, 0, 14, 7, 0).toISOString(),
    });
    const grouped = groupConversationsByDay([silent], NOW);
    expect(grouped[0]!.label).toBe("Aujourd'hui");
  });

  it('returns no sections for an empty inbox', () => {
    expect(groupConversationsByDay([], NOW)).toEqual([]);
  });
});

describe('roleLabel', () => {
  it('maps roles to neutral French labels', () => {
    expect(roleLabel('driver')).toBe('Conducteur');
    expect(roleLabel('rider')).toBe('Passager');
  });
});

describe('formatDepartureLabel', () => {
  it('shows clock time for a departure later today', () => {
    const label = formatDepartureLabel(new Date(2026, 0, 14, 14, 30).toISOString(), NOW);
    expect(label).toBe('14:30');
  });

  it('shows "Demain" for a departure tomorrow, regardless of time', () => {
    const label = formatDepartureLabel(new Date(2026, 0, 15, 9, 0).toISOString(), NOW);
    expect(label).toBe('Demain');
  });

  it('shows a short date beyond tomorrow', () => {
    const label = formatDepartureLabel(new Date(2026, 0, 20, 9, 0).toISOString(), NOW);
    expect(label).toContain('20');
  });

  it('returns an empty string for an invalid date', () => {
    expect(formatDepartureLabel('not-a-date', NOW)).toBe('');
  });
});

describe('searchConversations', () => {
  const alice = makeConversation({
    id: 'c-alice',
    otherParty: { id: 'u-a', fullName: 'Alice Ben Salah', avatarUrl: null },
    originLabel: 'Tunis',
    destinationLabel: 'Sousse',
  });
  const bilel = makeConversation({
    id: 'c-bilel',
    otherParty: { id: 'u-b', fullName: 'Bilel Trabelsi', avatarUrl: null },
    originLabel: 'Sfax',
    destinationLabel: 'Gabès',
  });
  const list = [alice, bilel];

  it('returns everything for an empty/whitespace query', () => {
    expect(searchConversations(list, '')).toEqual(list);
    expect(searchConversations(list, '   ')).toEqual(list);
  });

  it('matches by the other party name, case-insensitively', () => {
    expect(searchConversations(list, 'alice')).toEqual([alice]);
  });

  it('matches by origin or destination label', () => {
    expect(searchConversations(list, 'gabès')).toEqual([bilel]);
    expect(searchConversations(list, 'Tunis')).toEqual([alice]);
  });

  it('returns nothing when no field matches', () => {
    expect(searchConversations(list, 'zzz')).toEqual([]);
  });
});
