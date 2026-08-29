import { desc, eq } from 'drizzle-orm';
import type { NotificationEventType } from '@vaya/domain';
import type { RegisterPushTokenInput } from '@vaya/validation';
import type { getDatabase } from '../../lib/database.js';
import { deviceTokens, notifications, users } from '../../db/schema/index.js';
import { ForbiddenError, NotFoundError } from '../../lib/errors.js';
import { getLogger } from '../../config/logger.js';
import { enqueueNotificationDispatch } from '../../lib/queue.js';
import { sendExpoPushMessages } from './expo-push.js';
import { buildEmailTemplate } from './email-templates.js';
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
    where: eq(notifications.userId, userId),
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

const TITLES: Partial<Record<NotificationEventType, string>> = {
  booking_requested: 'Nouvelle demande de réservation',
  booking_accepted: 'Réservation acceptée',
  booking_declined: 'Réservation refusée',
  trip_driver_approaching: 'Votre conducteur approche',
  trip_completed: 'Trajet terminé',
  recurring_pattern_detected: 'Trajet récurrent détecté',
  recurring_proactive_match: 'Nouveau trajet correspondant',
  demand_signal_matched: 'Un trajet correspond à votre demande',
  message_received: 'Nouveau message',
  booking_cancelled: 'Réservation annulée',
  booking_no_show_reported: 'Absence signalée',
  trip_pickup_arrived: 'Votre conducteur est arrivé',
  trip_arriving: 'Votre conducteur arrive',
  trip_tracking_unavailable: 'Suivi temporairement indisponible',
  trip_passenger_onboard: 'Trajet en cours',
  trip_route_deviation: 'Changement d’itinéraire',
  trip_completion_reminder: 'Votre trajet est-il terminé ?',
  verification_submitted: 'Vérification soumise',
  verification_approved: 'Vous êtes vérifié',
  verification_declined: 'Vérification refusée',
  verification_resubmission_required: 'Vérification à mettre à jour',
  rating_received: 'Nouvel avis reçu',
};

function titleFor(type: NotificationEventType): string {
  return TITLES[type] ?? 'VAYA';
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

function bodyFor(type: NotificationEventType, payload: Record<string, unknown>): string {
  switch (type) {
    case 'booking_requested':
      return typeof payload.riderName === 'string'
        ? `${payload.riderName} souhaite réserver une place.`
        : 'Une nouvelle demande de réservation attend votre réponse.';
    case 'booking_accepted':
      return typeof payload.driverName === 'string'
        ? `${payload.driverName} a accepté votre demande.`
        : 'Votre demande de réservation a été acceptée.';
    case 'booking_declined':
      return typeof payload.driverName === 'string'
        ? `${payload.driverName} n'a pas pu accepter votre demande.`
        : 'Votre demande de réservation a été refusée.';
    case 'message_received':
      return typeof payload.senderName === 'string'
        ? `${payload.senderName} vous a envoyé un message.`
        : 'Vous avez reçu un nouveau message.';
    // Phase 9 (docs/roadmap/phase-09-ratings-trust.md): trip_completed is
    // reused as the rating-prompt trigger (trips.service.ts's completeTrip)
    // rather than adding a distinct event type — this is the only body this
    // event type has ever needed, since nothing dispatched it before this
    // phase.
    case 'trip_completed':
      return 'Votre trajet est terminé — notez votre expérience avant demain.';
    // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): dispatched
    // to the *other* party only — the actor already sees the outcome of
    // their own action on-screen (the cancellation sheet, the no-show
    // confirmation), so this is genuinely new information for the
    // recipient, not a redundant echo.
    case 'booking_cancelled':
      return 'Votre réservation a été annulée par l’autre partie.';
    case 'booking_no_show_reported':
      return 'Une absence a été signalée pour ce trajet.';
    // Phase 11 (docs/roadmap/phase-11-recurring-rides.md): the first,
    // previously-schema-only event types Phase 7 anticipated but never
    // dispatched — see recurring.service.ts's upsertDetectedPattern
    // (detected pattern crosses the suggested threshold) and
    // checkProactiveMatchesForEnabledRiderPatterns (a real published ride
    // now matches an enabled rider pattern).
    case 'recurring_pattern_detected':
      return 'Vous avez pris cet itinéraire plusieurs fois récemment — voulez-vous en faire un trajet régulier ?';
    case 'recurring_proactive_match':
      return 'Un trajet correspondant à votre itinéraire régulier vient d’être publié.';
    // Live tracking (docs/domain/live-tracking.md).
    case 'trip_pickup_arrived':
      return 'Votre conducteur est arrivé au point de rendez-vous.';
    case 'trip_arriving':
      return 'Votre conducteur arrive à destination dans quelques instants.';
    case 'trip_tracking_unavailable':
      return 'Le suivi en direct est temporairement indisponible — le trajet continue normalement.';
    // Journey-contract second pass (docs/unified_driver_and_passenger_journey.md
    // §33, §51, M-096/097, EDGE-051).
    case 'trip_passenger_onboard':
      return 'Vous êtes à bord — suivez votre trajet en direct.';
    case 'trip_route_deviation':
      return 'Votre conducteur a pris un itinéraire différent — votre heure d’arrivée est recalculée.';
    // Trip-staleness sweep (packages/domain/src/trip/trip-staleness.ts).
    case 'trip_completion_reminder':
      return 'Ce trajet semble terminé depuis un moment. Confirmez pour clore le trajet et permettre l’évaluation.';
    // Admin verification workflow (docs/domain/verification-workflow.md).
    case 'verification_submitted':
      return 'Votre vérification a été soumise. Aucune action supplémentaire n’est requise pour le moment.';
    case 'verification_approved':
      return 'Votre profil conducteur est vérifié — vous pouvez publier des trajets.';
    case 'verification_declined':
      return typeof payload.declineMessage === 'string'
        ? payload.declineMessage
        : 'Votre vérification n’a pas été approuvée.';
    case 'verification_resubmission_required':
      return typeof payload.declineMessage === 'string'
        ? payload.declineMessage
        : 'Votre vérification nécessite une mise à jour.';
    // Ratings & trust (docs/domain/model.md): ratings.service.ts's
    // createRating/recordAutomaticNoShowRating.
    case 'rating_received':
      return typeof payload.raterName === 'string' && typeof payload.stars === 'number'
        ? `${payload.raterName} vous a laissé un avis (${payload.stars.toFixed(1)}/5).`
        : 'Vous avez reçu un nouvel avis.';
    default:
      return 'Vous avez une nouvelle notification.';
  }
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

  const tokens = await db.query.deviceTokens.findMany({
    where: eq(deviceTokens.userId, notification.userId),
  });
  if (tokens.length === 0) return;

  const payload = (notification.payload ?? {}) as Record<string, unknown>;
  const categoryId = categoryFor(notification.type);
  const messages = tokens.map((t) => ({
    to: t.token,
    title: titleFor(notification.type),
    body: bodyFor(notification.type, payload),
    data: { notificationId: notification.id, type: notification.type, ...payload },
    ...(categoryId ? { categoryId } : {}),
  }));

  await sendExpoPushMessages(messages);
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
  if (!user?.email) return;

  await getEmailProvider().sendEmail({
    to: user.email,
    subject: template.subject,
    html: template.html,
    text: template.text,
  });
}
