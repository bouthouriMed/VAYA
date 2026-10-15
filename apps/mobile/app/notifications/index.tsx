import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import type { TFunction } from 'i18next';
import type { SupportedLocale } from '@vaya/config';
import {
  Text,
  Icon,
  Avatar,
  Chip,
  ScreenHeader,
  HeaderIconButton,
  StateView,
  ActivityRow,
  CountdownRing,
  RouteSegmentBar,
  FactRow,
  Button,
  useAppTheme,
  spacing,
  radii,
  elevation,
  haptics,
  type Fact,
  type ActivityTone,
} from '@vaya/design-system';
import { useAppSelector } from '../../src/state/store';
import { formatDaySectionLabel } from '../../src/features/conversations/inboxHelpers';
import { formatCurrency, formatDate, formatTime } from '../../src/utils/localeFormat';
import { shortenPlaceLabel } from '../../src/utils/placeLabel';
import {
  useListNotificationsQuery,
  useListRequestsForRideQuery,
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
} from '../../src/services/notifications/notificationCopy';
import { resolveNotificationDeepLink } from '../../src/services/notifications/deepLink';
import { trackEvent } from '../../src/services/analytics/analytics';
import { buildInbox, responseTimeLeft, type InboxFilter } from '../../src/features/notifications/inboxModel';

type Palette = ReturnType<typeof useAppTheme>['colors'];
type Translate = (key: string, params?: Record<string, unknown>) => string;

/** Re-renders every 30 s so countdowns and "open" requests stay true. */
function useNow(): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function shortWhen(iso: string, now: Date, locale: SupportedLocale): string {
  const date = new Date(iso);
  return date.toDateString() === now.toDateString()
    ? formatTime(date, locale)
    : formatDate(date, locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

function num(v: unknown): number | undefined {
  return typeof v === 'number' && Number.isFinite(v) ? v : undefined;
}
function str(v: unknown): string | undefined {
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

/** The person an event is about, when the payload names one. */
function counterpartOf(notification: AppNotification): { uri?: string | null; name: string } | undefined {
  const p = notification.payload;
  const name = str(p.driverName) ?? str(p.senderName) ?? str(p.riderName) ?? str(p.raterName);
  if (!name) return undefined;
  return { uri: str(p.driverAvatarUrl) ?? str(p.senderAvatarUrl) ?? str(p.riderAvatarUrl) ?? null, name };
}

/**
 * A seat request the driver can still answer: who (photo, rating), the
 * passenger's own leg drawn on the driver's whole ride, what it costs and
 * pays, how long is left to answer — and Accept/Decline right there.
 * Checks the booking's real status first (the ride's request list, cached
 * per ride): a request already answered elsewhere, or expired, collapses to
 * a timeline row instead of offering buttons that would fail.
 */
function RequestTicket({
  notification,
  now,
  theme,
  t,
  locale,
}: {
  notification: AppNotification;
  now: Date;
  theme: Palette;
  t: Translate;
  locale: SupportedLocale;
}): React.JSX.Element {
  const info = readNotificationCounterpartPayload(notification.type, notification.payload);
  const p = notification.payload;
  const { data: rideRequests } = useListRequestsForRideQuery(info.rideId ?? '', { skip: !info.rideId });
  const [acceptBooking, acceptState] = useAcceptBookingMutation();
  const [declineBooking, declineState] = useDeclineBookingMutation();
  const [resolvedAs, setResolvedAs] = useState<'accepted' | 'declined' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const serverStatus = rideRequests?.find((b) => b.id === info.bookingId)?.status;
  const status = resolvedAs ?? (serverStatus && serverStatus !== 'pending' ? serverStatus : null);
  const name = info.counterpartName ?? t('booking:passenger');

  function open(): void {
    trackEvent('notification_tapped', { type: notification.type, source: 'inbox' });
    const destination = resolveNotificationDeepLink(notification.type, notification.payload);
    if (destination) router.push(destination as Parameters<typeof router.push>[0]);
  }

  if (status) {
    const accepted = status === 'accepted';
    return (
      <ActivityRow
        icon={accepted ? 'checkmark-circle' : 'close-circle-outline'}
        tone={accepted ? 'accent' : 'neutral'}
        avatar={{ uri: info.counterpartAvatarUrl, name }}
        title={name}
        description={
          accepted
            ? t('notifications:driverRequest.resolvedAccepted')
            : status === 'declined'
              ? t('notifications:driverRequest.resolvedDeclined')
              : t('notifications:driverRequest.resolvedClosed')
        }
        timestamp={shortWhen(notification.createdAt, now, locale)}
        onPress={open}
        accessibilityLabel={t('notifications:driverRequest.accessibilityLabel', { name })}
        theme={theme}
      />
    );
  }

  async function respond(action: 'accept' | 'decline'): Promise<void> {
    if (!info.bookingId) return;
    setActionError(null);
    try {
      if (action === 'accept') await acceptBooking(info.bookingId).unwrap();
      else await declineBooking(info.bookingId).unwrap();
      setResolvedAs(action === 'accept' ? 'accepted' : 'declined');
      haptics.success();
      trackEvent('driver_request_response', { action, source: 'notifications' });
    } catch {
      haptics.error();
      setActionError(t('notifications:driverRequest.actionError'));
    }
  }

  const timeLeft = responseTimeLeft(notification, now);
  const from = info.originLabel ? shortenPlaceLabel(info.originLabel) : undefined;
  const to = info.destinationLabel ? shortenPlaceLabel(info.destinationLabel) : undefined;
  const rideFrom = str(p.rideOriginLabel);
  const rideTo = str(p.rideDestinationLabel);
  const segStart = num(p.segmentStartFraction);
  const segEnd = num(p.segmentEndFraction);
  const detourSeconds = num(p.detourExtraSeconds);
  const price = num(p.contributionTotal);
  const seats = info.seatsRequested ?? 1;

  const facts: Fact[] = [];
  if (detourSeconds !== undefined) {
    const minutes = Math.round(detourSeconds / 60);
    facts.push(
      minutes < 1
        ? { icon: 'git-merge-outline', value: t('notifications:driverRequest.onRoute'), caption: t('notifications:driverRequest.detour') }
        : { icon: 'time-outline', value: `+${minutes} min`, caption: t('notifications:driverRequest.detour') },
    );
  }
  if (price !== undefined) {
    facts.push({ icon: 'wallet-outline', value: formatCurrency(price, locale), caption: t('notifications:driverRequest.forYou'), emphasis: true });
  }
  facts.push({ icon: 'person-outline', value: String(seats), caption: t('notifications:driverRequest.seats', { count: seats }) });
  if (info.departureAt) {
    const departure = new Date(info.departureAt);
    facts.push({
      icon: 'navigate-outline',
      value: formatTime(departure, locale),
      // The day too whenever it isn't today — "20:44" alone would read as tonight.
      caption:
        departure.toDateString() === now.toDateString()
          ? t('notifications:driverRequest.departure')
          : formatDate(departure, locale, { weekday: 'short', day: 'numeric' }),
    });
  }

  const busy = acceptState.isLoading || declineState.isLoading;

  return (
    <View
      style={[
        styles.ticket,
        elevation?.md,
        { backgroundColor: theme.surface, borderColor: theme.outlineVariant, shadowColor: theme.ink },
      ]}
    >
      <TouchableOpacity
        onPress={open}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('notifications:driverRequest.accessibilityLabel', { name })}
        style={styles.ticketHead}
      >
        <View>
          <Avatar uri={info.counterpartAvatarUrl} name={name} sizePx={52} />
          {info.counterpartRatingAvg ? (
            <View style={[styles.ratingBadge, { backgroundColor: theme.ink, borderColor: theme.surface }]}>
              <Icon name="star" size="xs" color={theme.accentGlow} />
              <Text variant="caption" color={theme.onInk} style={styles.ratingText}>
                {info.counterpartRatingAvg.toFixed(1)}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={styles.ticketIdentity}>
          <Text variant="title" color={theme.ink} numberOfLines={1}>
            {name}
          </Text>
          <Text variant="caption" color={info.counterpartRatingAvg ? theme.inkMuted : theme.accentStrong} numberOfLines={1}>
            {info.counterpartRatingAvg
              ? t('notifications:driverRequest.wantsSeats', { count: seats })
              : t('notifications:driverRequest.newOnVaya')}
          </Text>
        </View>
        {timeLeft ? (
          <CountdownRing
            remaining={timeLeft.remaining}
            value={String(timeLeft.minutes)}
            unit="min"
            accessibilityLabel={t('notifications:driverRequest.timeLeft', { count: timeLeft.minutes })}
            theme={theme}
          />
        ) : null}
      </TouchableOpacity>

      {from && to ? (
        <View style={styles.legBlock}>
          <View style={styles.legRow}>
            <View style={[styles.legDot, { borderColor: theme.accent }]} />
            <Text variant="label" color={theme.ink} numberOfLines={1} style={styles.legText}>
              {from}
            </Text>
            <Icon name="arrow-forward" size="xs" color={theme.inkFaint} />
            <View style={[styles.legDot, { borderColor: theme.accent, backgroundColor: theme.accent }]} />
            <Text variant="label" color={theme.ink} numberOfLines={1} style={styles.legText}>
              {to}
            </Text>
          </View>
          {rideFrom && rideTo && segStart !== undefined && segEnd !== undefined ? (
            <RouteSegmentBar
              startLabel={shortenPlaceLabel(rideFrom)}
              endLabel={shortenPlaceLabel(rideTo)}
              segmentStart={segStart}
              segmentEnd={segEnd}
              accessibilityLabel={t('notifications:driverRequest.legOnRide', {
                from,
                to,
                rideFrom: shortenPlaceLabel(rideFrom),
                rideTo: shortenPlaceLabel(rideTo),
              })}
              theme={theme}
            />
          ) : null}
        </View>
      ) : (
        <Text variant="bodySmall" color={theme.inkMuted}>
          {notificationDescription(notification.type, notification.payload, t as TFunction)}
        </Text>
      )}

      <FactRow facts={facts} theme={theme} />

      <View style={styles.actions}>
        <Button
          variant="outline"
          size="md"
          label={t('common:actions.decline')}
          onPress={() => void respond('decline')}
          disabled={busy}
          style={styles.actionFlex}
        />
        <Button
          variant="primary"
          size="md"
          label={t('common:actions.accept')}
          onPress={() => void respond('accept')}
          disabled={busy}
          loading={acceptState.isLoading}
          style={styles.actionFlex}
        />
      </View>
      {actionError ? (
        <Text variant="caption" color={theme.error} align="center">
          {actionError}
        </Text>
      ) : null}
    </View>
  );
}

const FILTERS: InboxFilter[] = ['all', 'requests', 'trips', 'messages'];

/**
 * Notifications inbox (2026-10-15 redesign, docs/roadmap/phase-14-
 * intelligent-pickup-engine.md): open seat requests first as rich tickets
 * (who, their leg on the driver's ride, detour, earnings, time left), then
 * everything else as a calm day-grouped activity timeline, filterable by
 * kind. Newest first within each day.
 */
export default function NotificationsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const { t, i18n } = useTranslation();
  const locale = i18n.language as SupportedLocale;
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const now = useNow();
  const [filter, setFilter] = useState<InboxFilter>('all');
  const { data: notifications, isLoading, isError, refetch } = useListNotificationsQuery(undefined, {
    skip: !accessToken,
  });
  const [markRead] = useMarkNotificationReadMutation();

  const inbox = useMemo(() => buildInbox(notifications ?? [], filter, now), [notifications, filter, now]);

  if (!accessToken) {
    return <Redirect href="/sign-in" />;
  }

  function handleOpen(notification: AppNotification): void {
    if (!notification.readAt) void markRead(notification.id);
    trackEvent('notification_tapped', { type: notification.type, source: 'inbox' });
    const destination = resolveNotificationDeepLink(notification.type, notification.payload);
    if (destination) router.push(destination as Parameters<typeof router.push>[0]);
  }

  function markAllRead(): void {
    for (const notification of notifications ?? []) {
      if (!notification.readAt) void markRead(notification.id);
    }
  }

  const isEmpty = inbox.openRequests.length === 0 && inbox.sections.length === 0;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        topInset={insets.top}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/explore'))}
        backLabel={t('common:actions.back')}
        title={t('notifications:inbox.title')}
        subtitle={inbox.unreadCount > 0 ? t('notifications:inbox.unread', { count: inbox.unreadCount }) : undefined}
        right={
          inbox.unreadCount > 0 ? (
            <HeaderIconButton
              icon="checkmark-done-outline"
              onPress={markAllRead}
              accessibilityLabel={t('notifications:inbox.markAllRead')}
            />
          ) : null
        }
      />

      {isLoading ? (
        <StateView status="loading" skeleton="list" />
      ) : isError ? (
        <StateView
          status="error"
          title={t('notifications:inbox.loadError')}
          description={t('trips:loadError.description')}
          actionLabel={t('common:actions.retry')}
          onAction={() => void refetch()}
        />
      ) : !notifications || notifications.length === 0 ? (
        <StateView
          status="empty"
          iconName="notifications-outline"
          title={t('notifications:inbox.empty')}
          description={t('notifications:inbox.emptyDescription')}
        />
      ) : (
        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.list}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={styles.filtersBleed}
            contentContainerStyle={styles.filters}
          >
            {FILTERS.filter((f) => f === 'all' || inbox.counts[f] > 0).map((f) => (
              <Chip
                key={f}
                label={f === 'all' ? t('notifications:filters.all') : `${t(`notifications:filters.${f}`)} · ${inbox.counts[f]}`}
                selected={filter === f}
                onPress={() => setFilter(f)}
                theme={theme}
              />
            ))}
          </ScrollView>

          {inbox.openRequests.length > 0 ? (
            <View style={styles.section}>
              <View style={styles.sectionHeadRow}>
                <Text variant="label" color={theme.ink} style={styles.sectionHeader}>
                  {t('notifications:inbox.toHandle')}
                </Text>
                <View style={[styles.countPill, { backgroundColor: theme.accent }]}>
                  <Text variant="caption" color={theme.onAccent} style={styles.countText}>
                    {inbox.openRequests.length}
                  </Text>
                </View>
              </View>
              {inbox.openRequests.map((notification) => (
                <RequestTicket
                  key={notification.id}
                  notification={notification}
                  now={now}
                  theme={theme}
                  t={t}
                  locale={locale}
                />
              ))}
            </View>
          ) : null}

          {inbox.sections.map((section) => (
            <View key={section.dayKey} style={styles.section}>
              <Text variant="label" color={theme.inkFaint} style={styles.sectionHeader}>
                {formatDaySectionLabel(section.items[0]!.createdAt, t as TFunction, now, locale)}
              </Text>
              <View style={[styles.timeline, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
                {section.items.map((notification, index) => {
                  const meta = notificationTypeMeta(notification.type, t as TFunction);
                  const unread = !notification.readAt;
                  return (
                    <ActivityRow
                      key={notification.id}
                      icon={meta.icon}
                      tone={notificationTone(notification.type) as ActivityTone}
                      avatar={counterpartOf(notification)}
                      title={meta.title}
                      description={notificationDescription(notification.type, notification.payload, t as TFunction)}
                      timestamp={shortWhen(notification.createdAt, now, locale)}
                      unread={unread}
                      connectToNext={index < section.items.length - 1}
                      onPress={() => handleOpen(notification)}
                      accessibilityLabel={`${meta.title}${unread ? `, ${t('common:status.unread')}` : ''}`}
                      theme={theme}
                    />
                  );
                })}
              </View>
            </View>
          ))}

          {isEmpty ? (
            <StateView
              status="empty"
              iconName="file-tray-outline"
              title={t('notifications:inbox.emptyFilter')}
              description={t('notifications:inbox.emptyFilterDescription')}
            />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  list: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing['3xl'],
    gap: spacing.lg,
  },
  // Scrolls edge to edge, past the list's side margin.
  filtersBleed: {
    marginHorizontal: -spacing.lg,
  },
  filters: {
    gap: spacing.sm,
    paddingTop: spacing.md,
    paddingHorizontal: spacing.lg,
  },
  section: {
    gap: spacing.sm,
  },
  sectionHeadRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  sectionHeader: {
    textTransform: 'uppercase',
    letterSpacing: 0.6,
  },
  countPill: {
    minWidth: 20,
    height: 20,
    borderRadius: radii.full,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  countText: {
    fontWeight: '700',
  },
  ticket: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
    gap: spacing.md,
  },
  ticketHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  ticketIdentity: {
    flex: 1,
    gap: 2,
  },
  ratingBadge: {
    position: 'absolute',
    bottom: -6,
    alignSelf: 'center',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    borderRadius: radii.full,
    borderWidth: 2,
    paddingHorizontal: 5,
    paddingVertical: 1,
  },
  ratingText: {
    fontSize: 10,
    fontWeight: '700',
  },
  legBlock: {
    gap: spacing.sm,
  },
  legRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  legDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2.5,
  },
  legText: {
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionFlex: {
    flex: 1,
  },
  timeline: {
    borderRadius: radii.xl,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    paddingTop: spacing.md,
  },
});
