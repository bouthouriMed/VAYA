import { describe, it, expect, vi } from 'vitest';
import type { TFunction } from 'i18next';
import {
  isOwnMessage,
  canSendMessage,
  mergeAndSortMessages,
  submitMessage,
  getTripContext,
  groupMessagesByDay,
} from '../conversationHelpers';
import type { Conversation, ConversationMessage } from '../../../state/api';

// Mock translation function for tests
const mockT: TFunction = ((key: string) => {
  const translations: Record<string, string> = {
    'common:time.today': "Aujourd'hui",
    'common:time.yesterday': 'Hier',
    'common:time.tomorrow': 'Demain',
    'booking:status_completed': 'Terminé',
    'booking:status_in_progress': 'En cours',
    'booking:conversation.tripUpcoming': 'Trajet à venir',
    'booking:conversation.tripActive': 'Trajet en cours',
    'booking:conversation.tripCompleted': 'Trajet terminé',
  };
  return translations[key] ?? key;
}) as unknown as TFunction;

function makeMessage(overrides: Partial<ConversationMessage> = {}): ConversationMessage {
  return {
    id: 'm1',
    conversationId: 'c1',
    senderUserId: 'user-a',
    body: 'hello',
    createdAt: '2026-08-19T10:00:00.000Z',
    ...overrides,
  };
}

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'c1',
    bookingId: 'b1',
    status: 'open',
    createdAt: '2026-08-19T09:00:00.000Z',
    updatedAt: '2026-08-19T09:00:00.000Z',
    viewerRole: 'rider',
    otherParty: { id: 'driver-1', fullName: 'Sami Trabelsi', avatarUrl: null },
    otherPartyRole: 'driver',
    isOtherPartyVerified: true,
    rideId: 'ride-1',
    originLabel: 'Tunis',
    destinationLabel: 'Sousse',
    pickupLabel: 'Tunis',
    dropoffLabel: 'Sousse',
    departureAt: '2026-08-20T08:00:00.000Z',
    rideStatus: 'published',
    tripStatus: null,
    lastMessage: null,
    hasUnread: false,
    ...overrides,
  };
}

describe('isOwnMessage', () => {
  it('is true when the sender matches the current user', () => {
    expect(isOwnMessage(makeMessage({ senderUserId: 'user-a' }), 'user-a')).toBe(true);
  });

  it('is false when the sender is the other party', () => {
    expect(isOwnMessage(makeMessage({ senderUserId: 'user-a' }), 'user-b')).toBe(false);
  });
});

describe('canSendMessage', () => {
  it('allows sending while the conversation is open', () => {
    expect(canSendMessage(makeConversation({ status: 'open' }))).toBe(true);
  });

  it('disallows sending once the conversation is closed (trip terminal)', () => {
    expect(canSendMessage(makeConversation({ status: 'closed' }))).toBe(false);
  });

  it('disallows sending while the conversation is still loading (undefined)', () => {
    expect(canSendMessage(undefined)).toBe(false);
  });
});

describe('mergeAndSortMessages', () => {
  it('de-dupes overlapping ids across polling responses', () => {
    const first = [makeMessage({ id: 'm1', createdAt: '2026-08-19T10:00:00.000Z' })];
    const second = [
      makeMessage({ id: 'm1', createdAt: '2026-08-19T10:00:00.000Z' }),
      makeMessage({ id: 'm2', createdAt: '2026-08-19T10:01:00.000Z' }),
    ];
    const merged = mergeAndSortMessages(first, second);
    expect(merged).toHaveLength(2);
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2']);
  });

  it('sorts by createdAt ascending regardless of input order', () => {
    const existing = [makeMessage({ id: 'm2', createdAt: '2026-08-19T10:05:00.000Z' })];
    const incoming = [makeMessage({ id: 'm1', createdAt: '2026-08-19T10:00:00.000Z' })];
    const merged = mergeAndSortMessages(existing, incoming);
    expect(merged.map((m) => m.id)).toEqual(['m1', 'm2']);
  });
});

describe('submitMessage', () => {
  it('does not send whitespace-only input', async () => {
    const sendMessage = vi.fn();
    const trackEvent = vi.fn();
    const result = await submitMessage('   ', { sendMessage, trackEvent, role: 'rider' });
    expect(result).toBe(false);
    expect(sendMessage).not.toHaveBeenCalled();
    expect(trackEvent).not.toHaveBeenCalled();
  });

  it('sends trimmed body and tracks message_sent with the caller role', async () => {
    const sendMessage = vi.fn().mockResolvedValue(undefined);
    const trackEvent = vi.fn();
    const result = await submitMessage('  hello there  ', {
      sendMessage,
      trackEvent,
      role: 'driver',
    });
    expect(result).toBe(true);
    expect(sendMessage).toHaveBeenCalledWith('hello there');
    expect(trackEvent).toHaveBeenCalledWith('message_sent', { role: 'driver' });
  });

  it('propagates a send failure without tracking message_sent', async () => {
    const sendMessage = vi.fn().mockRejectedValue(new Error('network error'));
    const trackEvent = vi.fn();
    await expect(
      submitMessage('hi', { sendMessage, trackEvent, role: 'rider' }),
    ).rejects.toThrow('network error');
    expect(trackEvent).not.toHaveBeenCalled();
  });
});

describe('getTripContext', () => {
  it('labels an upcoming trip before departure with no live trip yet', () => {
    expect(getTripContext(makeConversation({ tripStatus: null }), mockT)).toEqual({
      label: 'Trajet à venir',
      isLive: false,
    });
  });

  it('labels a scheduled trip as upcoming too', () => {
    expect(getTripContext(makeConversation({ tripStatus: 'scheduled' }), mockT)).toEqual({
      label: 'Trajet à venir',
      isLive: false,
    });
  });

  it('marks active trip statuses as live', () => {
    for (const status of ['driver_approaching', 'pickup', 'active', 'arriving']) {
      expect(getTripContext(makeConversation({ tripStatus: status }), mockT).isLive).toBe(true);
    }
    expect(getTripContext(makeConversation({ tripStatus: 'pickup' }), mockT).label).toBe(
      'Trajet en cours',
    );
  });

  it('labels terminal trips and closed conversations as finished, never live', () => {
    for (const status of ['completed', 'no_show', 'cancelled']) {
      expect(getTripContext(makeConversation({ tripStatus: status }), mockT)).toEqual({
        label: 'Trajet terminé',
        isLive: false,
      });
    }
    expect(
      getTripContext(makeConversation({ status: 'closed', tripStatus: 'completed' }), mockT),
    ).toEqual({ label: 'Trajet terminé', isLive: false });
  });
});

describe('groupMessagesByDay', () => {
  const NOW = new Date(2026, 7, 19, 12, 0); // 2026-08-19 local noon

  it('groups same-day messages under one pill and splits distinct days in order', () => {
    const groups = groupMessagesByDay(
      [
        makeMessage({ id: 'a', createdAt: new Date(2026, 7, 18, 20, 0).toISOString() }),
        makeMessage({ id: 'b', createdAt: new Date(2026, 7, 19, 8, 0).toISOString() }),
        makeMessage({ id: 'c', createdAt: new Date(2026, 7, 19, 9, 30).toISOString() }),
      ],
      mockT,
      NOW,
    );

    expect(groups.map((g) => g.label)).toEqual(['Hier', "Aujourd'hui"]);
    expect(groups[1]!.messages.map((m) => m.id)).toEqual(['b', 'c']);
  });

  it('returns no groups for an empty thread', () => {
    expect(groupMessagesByDay([], mockT, NOW)).toEqual([]);
  });
});
