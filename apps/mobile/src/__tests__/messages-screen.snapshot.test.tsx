import React from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderJSON } from './test-utils/renderJSON';
import type { InboxConversation } from '../features/conversations/inboxHelpers';

/**
 * Real react-test-renderer snapshots of (tabs)/messages.tsx (Stitch
 * reference: "Inbox / trip-centric overview",
 * stitch/message/inbox-trip-centric-overview.html) — pins the tab-root
 * headline treatment (headlineDisplay, centered per that reference)
 * across all four designed states: loading skeletons, fetch error,
 * genuinely-empty inbox, and a populated two-section list.
 *
 * System time is pinned (Date only — timers/network stay real) because
 * the inbox's day-bucket labels ("Aujourd'hui"/"Hier") and relative row
 * timestamps are computed against `new Date()`; without the pin every
 * snapshot would silently drift by one day.
 */

const FIXED_NOW = new Date('2026-08-22T10:00:00');

vi.mock('expo-router', () => ({
  router: { push: vi.fn(), navigate: vi.fn() },
  Redirect: () => null,
}));

// messages.tsx guards itself behind accessToken (messaging is
// identity-scoped end to end) — these snapshots exercise the signed-in
// experience, so the store needs a token to get past the guard at all.
vi.mock('../state/store', () => ({
  useAppSelector: (selector: (s: { auth: { accessToken: string } }) => unknown) =>
    selector({ auth: { accessToken: 'test-token' } }),
}));

const OPEN_TODAY: InboxConversation = {
  id: 'conv-1',
  bookingId: 'booking-1',
  status: 'open',
  updatedAt: '2026-08-22T09:41:00',
  viewerRole: 'rider',
  otherParty: { id: 'u-1', fullName: 'Amine Ben Salah', avatarUrl: null },
  otherPartyRole: 'driver',
  isOtherPartyVerified: true,
  originLabel: 'Tunis',
  destinationLabel: 'Sousse',
  departureAt: '2026-08-23T08:30:00',
  tripStatus: null,
  lastMessage: {
    body: 'Je passe vous prendre devant la station.',
    createdAt: '2026-08-22T09:41:00',
    senderUserId: 'u-1',
  },
};

const CLOSED_YESTERDAY: InboxConversation = {
  id: 'conv-2',
  bookingId: 'booking-2',
  status: 'closed',
  updatedAt: '2026-08-21T18:05:00',
  viewerRole: 'rider',
  otherParty: { id: 'u-2', fullName: 'Salma Trabelsi', avatarUrl: null },
  otherPartyRole: 'driver',
  isOtherPartyVerified: false,
  originLabel: 'Tunis',
  destinationLabel: 'Hammamet',
  departureAt: '2026-08-20T14:00:00',
  tripStatus: 'completed',
  lastMessage: null,
};

type QueryResult = {
  data?: InboxConversation[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => unknown;
};

function mockApi(result: QueryResult): void {
  vi.doMock('../state/api', () => ({
    useListConversationsQuery: () => result,
  }));
}

async function renderMessages(): Promise<ReturnType<typeof renderJSON>> {
  vi.resetModules();
  const { default: MessagesScreen } = await import('../../app/(tabs)/messages');
  return renderJSON(<MessagesScreen />);
}

describe('messages.tsx snapshots', () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: FIXED_NOW, toFake: ['Date'] });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('loading — headline over conversation-row skeletons', async () => {
    mockApi({ isLoading: true, isError: false, refetch: () => {} });
    expect(await renderMessages()).toMatchSnapshot();
  });

  it('error — full-screen retry EmptyState', async () => {
    mockApi({ isLoading: false, isError: true, refetch: () => {} });
    expect(await renderMessages()).toMatchSnapshot();
  });

  it('empty inbox — headline, filter-less, first-run EmptyState', async () => {
    mockApi({ data: [], isLoading: false, isError: false, refetch: () => {} });
    expect(await renderMessages()).toMatchSnapshot();
  });

  it("populated — filter chips over Aujourd'hui/Hier day sections", async () => {
    mockApi({
      data: [OPEN_TODAY, CLOSED_YESTERDAY],
      isLoading: false,
      isError: false,
      refetch: () => {},
    });
    expect(await renderMessages()).toMatchSnapshot();
  });
});
