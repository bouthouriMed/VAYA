import { and, desc, eq, inArray, notInArray } from 'drizzle-orm';
import {
  EMAIL_ONLY_NOTIFICATION_TYPES,
  isEmailOnlyNotificationType,
  type NotificationEventType,
} from '@vaya/domain';
import type { RegisterPushTokenInput } from '@vaya/validation';
import type { getDatabase } from '../../lib/database.js';
import { deviceTokens, notifications, users } from '../../db/schema/index.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { getLogger } from '../../config/logger.js';
import { enqueueNotificationDispatch } from '../../lib/queue.js';
import { isDeadTokenTicket, sendExpoPushMessages } from './expo-push.js';
import { buildEmailTemplate } from './email-templates.js';
import { composeNotification } from './notification-copy.js';
import { loadNotificationContext } from './notification-context.js';
import { getEmailProvider } from '../../lib/email/index.js';

type Database = ReturnType<typeof getDatabase>;

const NOTIFICATION_LIST_LIMIT = 50;

/** Register/update this device's Expo push token for the current user.
 *  `token` is globally unique (device-tokens.schema.ts) — a re-registration
 *  (reinstall, refreshed token, or the same physical device logging into a
 *  different account) reassigns the existing row rather than accumulating
 *  duplicates. */
export async function registerPushToken(
  db: Database,
  userId: string,
  input: RegisterPushTokenInput,
) {
  const existing = await db.query.deviceTokens.findFirst({
    where: eq(deviceTokens.token, input.token),
  });

  if (existing) {
    const [updated] = await db
      .update(deviceTokens)
      .set({ userId, platform: input.platform, updatedAt: new Date() })
      .where(eq(deviceTokens.id, existing.id))
      .returning();
    if (!updated) throw new Error('Failed to update device token');
    return updated;
  }

  const [created] = await db
    .insert(deviceTokens)
    .values({ userId, token: input.token, platform: input.platform })
    .returning();
  if (!created) throw new Error('Failed to register device token');
  return created;
}

/** Removes this device's token from the signed-in user (logout) so the
 *  device stops receiving the previous account's pushes. Scoped to the
 *  caller's own rows — a token another account has since claimed is left
 *  alone. Idempotent. */
export async function unregisterPushToken(db: Database, userId: string, token: string): Promise<void> {
  await db
    .delete(deviceTokens)
    .where(and(eq(deviceTokens.token, token), eq(deviceTokens.userId, userId)));
}

/**
 * Creates the in-app `notifications` row (the source of truth for the
 * inbox — always created regardless of push outcome, per this phase's
 * business rule) and best-effort enqueues a dispatch job. This is the one
 * hook point booking flows call into — see bookings.service.ts's
 * create/accept/decline paths — and it deliberately never throws past the
 * row insert itself failing: an enqueue failure is logged and swallowed so
 * it can never fail the caller's primary action.
 */
export async function createNotification(
  db: Database,
  userId: string,
  type: NotificationEventType,
  payload: Record<string, unknown> = {},
) {
  const [notification] = await db.insert(notifications).values({ userId, type, payload }).returning();
  if (!notification) throw new Error('Failed to create notification');

  try {
    await enqueueNotificationDispatch(notification.id);
  } catch (err) {
    // enqueueNotificationDispatch already swallows its own errors — this
    // catch is a second line of defense in case that contract ever slips.
    getLogger().error(
      { err, notificationId: notification.id },
      'Failed to enqueue notification dispatch job',
    );
  }

  return notification;
}

/**
 * Best-effort wrapper around createNotification, shared by every call site
 * that must never let a notification-side failure fail its primary action
 * (bookings.service.ts's create/accept/decline, conversations.service.ts's
 * sendMessage). createNotification already isolates push-*send* failures
 * (they never leave the enqueue call); this extra layer covers the
 * notification *row insert* itself failing too.
 */
export async function notifyBestEffort(
  db: Database,
  userId: string,
  type: NotificationEventType,
  payload: Record<string, unknown>,
): Promise<void> {
  try {
    await createNotification(db, userId, type, payload);
  } catch (err) {
    getLogger().error({ err, userId, type }, 'Failed to create notification row');
  }
}

export async function listNotifications(db: Database, userId: string) {
  return db.query.notifications.findMany({
    where: and(
      eq(notifications.userId, userId),
      notInArray(notifications.type, [...EMAIL_ONLY_NOTIFICATION_TYPES]),
    ),
    orderBy: desc(notifications.createdAt),
    limit: NOTIFICATION_LIST_LIMIT,
  });
}

export async function markNotificationRead(db: Database, notificationId: string, userId: string) {
  const notification = await db.query.notifications.findFirst({
    where: eq(notifications.id, notificationId),
  });
  if (!notification) throw new NotFoundError('Notification');
  if (notification.userId !== userId) {
    throw new ForbiddenError('Not authorized to modify this notification');
  }

  const [updated] = await db
    .update(notifications)
    .set({ readAt: new Date(), updatedAt: new Date() })
    .where(eq(notifications.id, notificationId))
    .returning();
  if (!updated) throw new Error('Failed to mark notification as read');
  return updated;
}

/** The person a notification is about, as a picture beside the push —
 *  only for a real public https photo (the device fetches it itself). */
function pushImageFor(type: NotificationEventType, payload: Record<string, unknown>): string | undefined {
  const url = type === 'booking_requested' ? payload.riderAvatarUrl : undefined;
  return typeof url === 'string' && url.startsWith('https://') ? url : undefined;
}

/** OS-level quick-action pre-architecture (2026-08-23 redesign) — see
 *  ExpoPushMessage.categoryId's doc comment in expo-push.ts for the full
 *  scope note. `booking_requested` is the only event type with a real
 *  binary Accepter/Refuser action a driver could take straight from the
 *  notification; every other type is informational only. */
const NOTIFICATION_CATEGORIES: Partial<Record<NotificationEventType, string>> = {
  booking_requested: 'RIDE_REQUEST',
};

function categoryFor(type: NotificationEventType): string | undefined {
  return NOTIFICATION_CATEGORIES[type];
}

/**
 * Worker-side dispatch: given a `notifications` row id, sends a push to
 * every device token registered for that user. Only called from
 * notification-dispatch.worker.ts (never from the request/response cycle)
 * — any failure here throws so BullMQ's native retry picks it up.
 *
 * Zero registered tokens is a legitimate no-op, not a failure: per this
 * phase's business rule, a user with no device token simply gets no push —
 * the in-app row (created above, before this ever runs) already exists.
 */
export async function dispatchPushForNotification(db: Database, notificationId: string): Promise<void> {
  const notification = await db.query.notifications.findFirst({
    where: eq(notifications.id, notificationId),
  });
  if (!notification) {
    getLogger().warn({ notificationId }, 'Notification row not found for dispatch — skipping');
    return;
  }
  // A receipt of the user's own action: email only (see the domain doc).
  if (isEmailOnlyNotificationType(notification.type)) return;

  const tokens = await db.query.deviceTokens.findMany({
    where: eq(deviceTokens.userId, notification.userId),
  });
  if (tokens.length === 0) return;

  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const categoryId = categoryFor(notification.type);
  // Who, which trip, when, where — in the recipient's language
  // (notification-copy.ts) — plus the ids the app needs to open the right
  // screen on tap (bookingId/rideId and the recipient's role).
  const { locale, context, link } = await loadNotificationContext(db, notification.userId, payload);
  const { title, body } = composeNotification(notification.type, payload, context, locale);
  const image = pushImageFor(notification.type, payload);
  const messages = tokens.map((t) => ({
    to: t.token,
    title,
    body,
    data: { notificationId: notification.id, type: notification.type, ...payload, ...link },
    ...(categoryId ? { categoryId } : {}),
    ...(image ? { richContent: { image }, mutableContent: true } : {}),
  }));

  const tickets = await sendExpoPushMessages(messages);

  // Expo returns one ticket per message, in order. A partial failure (some
  // devices fine, some not) doesn't fail the job — but it must never be
  // silent either: this is exactly where a missing FCM/APNs credential
  // (`InvalidCredentials`) or an uninstalled app (`DeviceNotRegistered`)
  // shows up.
  const deadTokenIds: string[] = [];
  tickets.forEach((ticket, i) => {
    if (ticket.status !== 'error') return;
    const token = tokens[i];
    if (isDeadTokenTicket(ticket) && token) deadTokenIds.push(token.id);
    getLogger().warn(
      {
        notificationId,
        platform: token?.platform,
        error: ticket.details?.error,
        message: ticket.message,
      },
      'Expo push ticket error',
    );
  });
  if (deadTokenIds.length > 0) {
    await db.delete(deviceTokens).where(inArray(deviceTokens.id, deadTokenIds));
  }
}

/**
 * Worker-side email dispatch, run alongside dispatchPushForNotification for
 * the same `notifications` row (notification-dispatch.worker.ts) — reuses
 * Phase 7's single queue/job rather than a second job type, per this
 * codebase's "one minimal queue" rule. A no-op, not a failure, whenever:
 *  - buildEmailTemplate has no template for this event type (most types
 *    don't emit email at all — see its own doc comment), or
 *  - the recipient has no email on file (phone-first auth — users.email is
 *    nullable; a phone-only account simply gets no email, same posture as
 *    dispatchPushForNotification's "zero device tokens" no-op).
 * Throws on an actual send failure so BullMQ's native retry picks it up,
 * mirroring dispatchPushForNotification's contract exactly.
 */
export async function dispatchEmailForNotification(db: Database, notificationId: string): Promise<void> {
  const notification = await db.query.notifications.findFirst({
    where: eq(notifications.id, notificationId),
  });
  if (!notification) {
    getLogger().warn({ notificationId }, 'Notification row not found for email dispatch — skipping');
    return;
  }

  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const template = buildEmailTemplate(notification.type, payload);
  if (!template) return;

  const user = await db.query.users.findFirst({ where: eq(users.id, notification.userId) });
  if (!user?.email) {
    // Expected for phone-only accounts — logged so "no email was sent" is
    // explainable from the worker logs rather than invisible.
    getLogger().info(
      { notificationId, userId: notification.userId, type: notification.type },
      'Email skipped: user has no email address',
    );
    return;
  }

  await getEmailProvider().sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}
