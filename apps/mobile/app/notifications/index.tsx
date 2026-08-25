import { useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { SupportedLocale } from '@vaya/config';
import { formatDate, formatTime } from '../../src/utils/localeFormat';
import {
  Text,
  Icon,
  Avatar,
  Badge,
  EmptyState,
  SkeletonBlock,
  useAppTheme,
  spacing,
  radii,
  haptics,
} from '@vaya/design-system';
import { useAppSelector } from '../../src/state/store';
import {
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
  type AppNotification,
} from '../../src/state/api';
import {
  notificationTypeMeta,
  notificationTone,
  notificationDescription,
  readNotificationCounterpartPayload,
  type NotificationTone,
} from '../../src/services/notifications/notificationCopy';
import { resolveNotificationDeepLink } from '../../src/services/notifications/deepLink';
import { trackEvent } from '../../src/services/analytics/analytics';

function formatWhen(iso: string, t: (key: string) => string, locale: SupportedLocale): string {
  const date = new Date(iso);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();
  const time = formatTime(date, locale);
  if (isToday) return `${t('common:time.today')}, ${time}`;
  const yesterday = new Date(now.getTime() - 24 * 60 * 60_000);
  if (date.toDateString() === yesterday.toDateString()) return `${t('common:time.yesterday')}, ${time}`;
  return `${formatDate(date, locale, { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
}

function formatPickupTime(iso: string | undefined, locale: SupportedLocale): string | undefined {
  if (!iso) return undefined;
  return formatTime(new Date(iso), locale);
}

/**
 * A tone maps to a real AppPalette role, not a hand-picked hex — this
 * screen has no colors of its own, only VAYA's existing brand tokens
 * (accent/error/info/warning + the ink family for the neutral default),
 * matching every other Stitch-rebuilt screen's discipline in this codebase.
 */
function toneColors(
  tone: NotificationTone,
  theme: ReturnType<typeof useAppTheme>['colors'],
): { bg: string; fg: string } {
  switch (tone) {
    case 'accent':
      return { bg: theme.accentGlow, fg: theme.accentStrong };
    case 'error':
      return { bg: theme.errorMuted, fg: theme.error };
    case 'info':
      return { bg: theme.surfaceMuted, fg: theme.ink };
    case 'neutral':
    default:
      return { bg: theme.surfaceMuted, fg: theme.inkFaint };
  }
}

/**
 * The driver's actionable request card (2026-08-23 notifications redesign):
 * a real passenger mini-profile (avatar/name/rating), a route pill, a seats
 * badge, the ride's departure time, and an inline Accepter/Refuser action
 * bar that resolves the request without leaving the inbox — the same
 * `useAcceptBookingMutation`/`useDeclineBookingMutation` RideRequestsSheet
 * already uses, not a parallel mutation path. Tapping the card body (not
 * the action buttons) opens the full request in Mes trajets, same
 * destination `resolveNotificationDeepLink` already resolves to.
 */
function DriverRequestCard({
  notification,
  theme,
  t,
  locale,
}: {
  notification: AppNotification;
  theme: ReturnType<typeof useAppTheme>['colors'];
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: SupportedLocale;
}): React.JSX.Element {
  const info = readNotificationCounterpartPayload(notification.type, notification.payload);
  const [acceptBooking, acceptState] = useAcceptBookingMutation();
  const [declineBooking, declineState] = useDeclineBookingMutation();
  const [resolvedAs, setResolvedAs] = useState<'accepted' | 'declined' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  async function respond(action: 'accept' | 'decline'): Promise<void> {
    if (!info.bookingId) return;
    setActionError(null);
    try {
      if (action === 'accept') {
        await acceptBooking(info.bookingId).unwrap();
        setResolvedAs('accepted');
      } else {
        await declineBooking(info.bookingId).unwrap();
        setResolvedAs('declined');
      }
      haptics.success();
      trackEvent('driver_request_response', { action, source: 'notifications' });
    } catch {
      haptics.error();
      setActionError(
        t('notifications:driverRequest.actionError'),
      );
    }
  }

  function openInTrips(): void {
    trackEvent('notification_tapped', { type: notification.type, source: 'inbox' });
    const destination = resolveNotificationDeepLink(notification.type, notification.payload);
    if (destination) router.push(destination as Parameters<typeof router.push>[0]);
  }

  const isBusy = acceptState.isLoading || declineState.isLoading;
  const hasRoute = Boolean(info.originLabel && info.destinationLabel);
  const pickupTime = formatPickupTime(info.departureAt, locale);

  return (
    <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
      <TouchableOpacity
        onPress={openInTrips}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={t('notifications:driverRequest.accessibilityLabel', { name: info.counterpartName ?? t('booking:passenger') })}
      >
        <View style={styles.requestHeaderRow}>
          <Avatar
            uri={info.counterpartAvatarUrl}
            name={info.counterpartName ?? '?'}
            sizePx={44}
            fallbackBackgroundColor={theme.surfaceMuted}
            fallbackTextColor={theme.ink}
          />
          <View style={styles.requestIdentityText}>
            <Text variant="label" color={theme.ink} numberOfLines={1}>
              {info.counterpartName ?? t('booking:passenger')}
            </Text>
            {info.counterpartRatingAvg ? (
              <View style={styles.ratingRow}>
                <Icon name="star" size="xs" color={theme.accent} />
                <Text variant="caption" color={theme.inkMuted}>
                  {info.counterpartRatingAvg.toFixed(1)}
                </Text>
              </View>
            ) : (
              <Text variant="caption" color={theme.inkFaint}>
                {t('notifications:driverRequest.newOnVaya')}
              </Text>
            )}
          </View>
          {!notification.readAt ? (
            <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} />
          ) : null}
        </View>

        {hasRoute ? (
          <View style={[styles.routePill, { backgroundColor: theme.surfaceMuted }]}>
            <Icon name="navigate-outline" size="xs" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.ink} numberOfLines={1} style={styles.routePillText}>
              {`${info.originLabel} → ${info.destinationLabel}`}
            </Text>
          </View>
        ) : (
          <Text variant="bodySmall" color={theme.inkMuted} style={styles.fallbackBody}>
            {notificationDescription(notification.type, notification.payload, t as TFunction)}
          </Text>
        )}

        <View style={styles.metaRow}>
          <Badge
            label={t('common:terms.seat', { count: info.seatsRequested ?? 1 })}
            variant="default"
            theme={theme}
          />
          {pickupTime ? <Badge label={pickupTime} variant="default" theme={theme} /> : null}
        </View>
      </TouchableOpacity>

      {resolvedAs ? (
        <View style={[styles.resolvedRow, { borderTopColor: theme.outlineVariant }]}>
          <Icon
            name={resolvedAs === 'accepted' ? 'checkmark-circle' : 'close-circle'}
            size="sm"
            color={resolvedAs === 'accepted' ? theme.accent : theme.error}
          />
          <Text variant="bodySmall" color={resolvedAs === 'accepted' ? theme.accent : theme.error}>
            {resolvedAs === 'accepted' ? t('notifications:driverRequest.resolvedAccepted') : t('notifications:driverRequest.resolvedDeclined')}
          </Text>
        </View>
      ) : (
        <>
          <View style={[styles.actionBar, { borderTopColor: theme.outlineVariant }]}>
            <TouchableOpacity
              style={[styles.actionButton, styles.declineButton, { borderColor: theme.outline }]}
              onPress={() => void respond('decline')}
              disabled={isBusy}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.decline')}
            >
              <Text variant="label" color={theme.error}>
                {t('common:actions.decline')}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.actionButton, { backgroundColor: theme.accent }]}
              onPress={() => void respond('accept')}
              disabled={isBusy}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.accept')}
            >
              <Text variant="label" color={theme.onAccent}>
                {t('common:actions.accept')}
              </Text>
            </TouchableOpacity>
          </View>
          {actionError ? (
            <Text variant="caption" color={theme.error} style={styles.actionErrorText}>
              {actionError}
            </Text>
          ) : null}
        </>
      )}

      <Text variant="caption" color={theme.inkFaint} style={styles.timestamp}>
        {formatWhen(notification.createdAt, t, locale)}
      </Text>
    </View>
  );
}

/**
 * Passenger-facing (and generic informational) card: a status-tinted icon,
 * the real per-payload description, and — for any type
 * `resolveNotificationDeepLink` actually knows how to route — a direct
 * "Voir les détails du trajet" CTA instead of relying on the whole row
 * being an implicit tap target.
 */
function StatusCard({
  notification,
  theme,
  onOpen,
  t,
  locale,
}: {
  notification: AppNotification;
  theme: ReturnType<typeof useAppTheme>['colors'];
  onOpen: (notification: AppNotification) => void;
  t: (key: string, params?: Record<string, unknown>) => string;
  locale: SupportedLocale;
}): React.JSX.Element {
  const meta = notificationTypeMeta(notification.type, t as TFunction);
  const tone = toneColors(notificationTone(notification.type), theme);
  const isUnread = !notification.readAt;
  const destination = resolveNotificationDeepLink(notification.type, notification.payload);

  return (
    <TouchableOpacity
      style={[
        styles.card,
        { backgroundColor: theme.surface, borderColor: theme.outlineVariant },
        isUnread && { borderColor: theme.accent },
      ]}
      activeOpacity={0.7}
      onPress={() => onOpen(notification)}
      accessibilityRole="button"
      accessibilityLabel={`${meta.title}${isUnread ? `, ${t('common:status.unread')}` : ''}`}
    >
      <View style={styles.rowTop}>
        <View style={[styles.iconWrap, { backgroundColor: tone.bg }]}>
          <Icon name={meta.icon} size="sm" color={tone.fg} />
        </View>
        <View style={styles.rowText}>
          <View style={styles.titleRow}>
            <Text variant="label" color={theme.ink} numberOfLines={1} style={styles.titleText}>
              {meta.title}
            </Text>
            {isUnread ? <View style={[styles.unreadDot, { backgroundColor: theme.accent }]} /> : null}
          </View>
          <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={2}>
            {notificationDescription(notification.type, notification.payload, t as TFunction)}
          </Text>
          <Text variant="caption" color={theme.inkFaint} style={styles.timestamp}>
            {formatWhen(notification.createdAt, t, locale)}
          </Text>
        </View>
      </View>

      {destination ? (
        <View style={[styles.actionRow, { borderTopColor: theme.outlineVariant }]}>
          <Text variant="bodySmall" color={theme.accent} style={styles.actionLabel}>
            {t('notifications:inbox.viewDetails')}
          </Text>
          <Icon name="chevron-forward" size="xs" color={theme.accent} />
        </View>
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * Notifications inbox (docs/roadmap/phase-07-notifications.md), redesigned
 * 2026-08-23 into an actionable component library rather than static text
 * blocks: `booking_requested` renders as `DriverRequestCard` (real
 * passenger profile + inline Accepter/Refuser, no forced navigation),
 * everything else as `StatusCard` (status-tinted icon + a direct
 * "Voir les détails" CTA when there's somewhere real to go).
 */
export default function NotificationsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t, i18n } = useTranslation();
  const locale = i18n.language as SupportedLocale;
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const { data: notifications, isLoading } = useListNotificationsQuery(undefined, {
    skip: !accessToken,
  });
  const [markRead] = useMarkNotificationReadMutation();

  // Defensive: only reachable today via the explore/trips bell (both already
  // gate this behind accessToken), but a deep link or a stale push tap could
  // land here directly for a guest — identity-scoped end to end.
  if (!accessToken) {
    return <Redirect href="/sign-in" />;
  }

  function handleOpen(notification: AppNotification): void {
    if (!notification.readAt) {
      void markRead(notification.id);
    }
    trackEvent('notification_tapped', { type: notification.type, source: 'inbox' });
    const destination = resolveNotificationDeepLink(notification.type, notification.payload);
    if (destination) {
      router.push(destination as Parameters<typeof router.push>[0]);
    }
  }

  const unreadCount = notifications?.filter((n) => !n.readAt).length ?? 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm, borderBottomColor: theme.outlineVariant }]}>
        <TouchableOpacity
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/explore'))}
          hitSlop={12}
          style={styles.backBtn}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
        >
          <Ionicons name="chevron-back" size={24} color={theme.ink} />
        </TouchableOpacity>
        <View style={styles.headerTitleCol}>
          <Text variant="headlineDisplay" color={theme.ink}>
            {t('notifications:inbox.title')}
          </Text>
          {unreadCount > 0 ? (
            <Text variant="bodySmall" color={theme.inkMuted}>
              {t('notifications:inbox.unread', { count: unreadCount })}
            </Text>
          ) : null}
        </View>
        <View style={styles.backBtn} />
      </View>

      {isLoading ? (
        <View style={styles.loadingList}>
          {[0, 1, 2].map((i) => (
            <SkeletonBlock key={i} height={100} radius="xl" />
          ))}
        </View>
      ) : !notifications || notifications.length === 0 ? (
        <View style={styles.emptyWrap}>
          <EmptyState
            icon={<Icon name="notifications-outline" size="lg" color={theme.inkFaint} />}
            title={t('notifications:inbox.empty')}
            description={t('notifications:inbox.emptyDescription')}
          />
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          {notifications.map((notification) =>
            notification.type === 'booking_requested' ? (
              <DriverRequestCard key={notification.id} notification={notification} theme={theme} t={t} locale={locale} />
            ) : (
              <StatusCard
                key={notification.id}
                notification={notification}
                theme={theme}
                onOpen={handleOpen}
                t={t}
                locale={locale}
              />
            ),
          )}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleCol: {
    alignItems: 'center',
    gap: 1,
  },
  loadingList: {
    padding: spacing.lg,
    gap: spacing.sm,
  },
  emptyWrap: {
    flex: 1,
    justifyContent: 'center',
  },
  list: {
    padding: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  rowTop: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  iconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  titleText: {
    flex: 1,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  timestamp: {
    marginTop: 2,
  },
  actionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 2,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionLabel: {
    fontWeight: '600',
  },
  requestHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requestIdentityText: {
    flex: 1,
    gap: 1,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  routePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
    marginTop: spacing.xs,
  },
  routePillText: {
    flex: 1,
    fontWeight: '600',
  },
  fallbackBody: {
    marginTop: spacing.xs,
  },
  metaRow: {
    flexDirection: 'row',
    gap: spacing.xs,
    marginTop: spacing.xs,
  },
  actionBar: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actionButton: {
    flex: 1,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButton: {
    borderWidth: 1,
  },
  actionErrorText: {
    textAlign: 'center',
  },
  resolvedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
