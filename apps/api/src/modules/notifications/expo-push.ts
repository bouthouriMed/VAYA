const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

interface ExpoPushResponseBody {
  data?: ExpoPushTicket[];
}

/**
 * Direct HTTP call to Expo's push API rather than `expo-server-sdk` — this
 * dispatch path only ever needs a plain send for 3 event types (no receipt
 * polling, no chunking beyond what a handful of tokens per user needs),
 * so a dependency-free call keeps the "one minimal queue, don't
 * over-architect" scope from docs/roadmap/phase-07-notifications.md honest
 * on the HTTP client too.
 *
 * Throws on any transport failure or a fully-rejected batch so the BullMQ
 * job fails and its native retry (lib/queue.ts) picks it up — this must
 * only ever be called from the dispatch worker, never inline in a request
 * handler.
 */
export async function sendExpoPushMessages(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  if (messages.length === 0) return [];

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Accept-Encoding': 'gzip, deflate',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(messages),
  });

  if (!response.ok) {
    throw new Error(`Expo push API responded with HTTP ${response.status}`);
  }

  const body = (await response.json()) as ExpoPushResponseBody;
  const tickets = body.data ?? [];
  const failed = tickets.filter((t) => t.status === 'error');
  if (tickets.length > 0 && failed.length === tickets.length) {
    throw new Error(`Expo push API rejected all ${failed.length} message(s): ${JSON.stringify(failed)}`);
  }
  return tickets;
}
