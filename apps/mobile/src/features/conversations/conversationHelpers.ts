import type { Conversation, ConversationMessage } from '../../state/api';

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

/** French, locale-aware timestamp for a message bubble — same
 *  today-vs-older split notifications/index.tsx's formatWhen already uses. */
export function formatMessageTimestamp(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  if (isToday) return time;
  return `${date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' })} · ${time}`;
}

export interface SubmitMessageDeps {
  sendMessage: (body: string) => Promise<unknown>;
  trackEvent: (name: string, payload?: Record<string, string | number | boolean | null>) => void;
  role: 'driver' | 'rider';
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
