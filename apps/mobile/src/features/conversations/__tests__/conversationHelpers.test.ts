import { describe, it, expect, vi } from 'vitest';
import {
  isOwnMessage,
  canSendMessage,
  mergeAndSortMessages,
  submitMessage,
} from '../conversationHelpers';
import type { Conversation, ConversationMessage } from '../../../state/api';

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
