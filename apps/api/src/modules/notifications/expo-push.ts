const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  /** iOS notification-category identifier (Expo's push API field name) —
   *  pre-architecture for OS-level quick actions (2026-08-23 redesign):
   *  when set, and when the client has registered a matching category via
   *  `Notifications.setNotificationCategoryAsync`, iOS renders that
   *  category's action buttons directly on the notification/lock screen.
   *  Structure only for now — see notificationCopy.ts on the mobile side
   *  for what's actually wired vs. deliberately deferred (a background
   *  handler that can fire an authenticated accept/decline call without
   *  opening the app is real, separate work, same category as this
   *  codebase's already-documented "on-device push delivery unverified"
   *  gap). Android quick actions need a distinct native mechanism
   *  (notification channels + a JS response handler) not covered by this
   *  field at all. */
  categoryId?: string;
  /** Android channel the notification posts to. Must match a channel the
   *  app created (notificationClient.ts's `ensureAndroidNotificationChannel`
   *  creates `default` with HIGH importance) — without it Android 8+ falls
   *  back to a low-importance "Miscellaneous" channel: no heads-up banner,
   *  often no sound, easy to miss entirely. */
  channelId?: string;
  /** `high` wakes a dozing Android device and is what lets FCM show the
   *  notification immediately instead of batching it. */
  priority?: 'default' | 'normal' | 'high';
  sound?: 'default' | null;
}

/** Applied to every message unless the caller overrides them — the
 *  delivery settings a user-facing, time-sensitive marketplace event
 *  (a booking request, an acceptance) actually needs. */
const DELIVERY_DEFAULTS = {
  channelId: 'default',
  priority: 'high',
  sound: 'default',
} as const satisfies Partial<ExpoPushMessage>;

export interface ExpoPushTicket {
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

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Accept-Encoding': 'gzip, deflate',
    'Content-Type': 'application/json',
  };
  // Required only when "Enhanced push security" is turned on for the Expo
  // project (expo.dev → project → Credentials → Access token); harmless
  // otherwise. Read from process.env directly so this stays a leaf module
  // with no config import (same as the other provider adapters).
  const accessToken = process.env.EXPO_ACCESS_TOKEN;
  if (accessToken) headers.Authorization = `Bearer ${accessToken}`;

  const response = await fetch(EXPO_PUSH_URL, {
    method: 'POST',
    headers,
    body: JSON.stringify(messages.map((m) => ({ ...DELIVERY_DEFAULTS, ...m }))),
  });

  if (!response.ok) {
    const detail = await Promise.resolve()
      .then(() => response.text())
      .catch(() => '');
    throw new Error(`Expo push API responded with HTTP ${response.status}: ${detail.slice(0, 500)}`);
  }

  const body = (await response.json()) as ExpoPushResponseBody;
  const tickets = body.data ?? [];
  const failed = tickets.filter((t) => t.status === 'error');
  if (tickets.length > 0 && failed.length === tickets.length) {
    throw new Error(`Expo push API rejected all ${failed.length} message(s): ${JSON.stringify(failed)}`);
  }
  return tickets;
}

/** A ticket error meaning the token will never work again (app
 *  uninstalled, push permission revoked, token rotated) — the row should be
 *  deleted rather than retried on every future notification. */
export function isDeadTokenTicket(ticket: ExpoPushTicket): boolean {
  return ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered';
}
