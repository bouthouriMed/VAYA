import { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Icon, Button, ScreenHeader, useAppTheme, spacing, radii, haptics } from '@vaya/design-system';
import type { SupportedLocale } from '@vaya/config';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useListMyBookingsQuery } from '../../src/state/api';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';
import { formatCalendarDate, formatCurrency, formatDateTime, formatTime, toIntlTag } from '../../src/utils/localeFormat';
import { useFocusAwarePolling } from '../../src/hooks/useFocusAwarePolling';

// How often to re-poll bookings while waiting for a driver response. There
// is no push/websocket channel into this specific screen — Phase 7's push
// notifications tell the *device*, but this screen needs its own state to
// react to, hence the poll.
const POLL_MS = 5000;

/** Stitch's "Request Sent" — this used to be a 1.6s auto-advancing
 *  animation that assumed acceptance; it's now a real held screen that
 *  polls the booking's actual status and only advances once a driver has
 *  really accepted. M-054 (docs/unified_driver_and_passenger_journey.md
 *  §20): the countdown shown here is now the real, server-authoritative
 *  `booking.expiresAt` (bookings.service.ts's createBooking, enforced by
 *  the booking-expiry-sweep worker) — this screen used to run its own
 *  fixed 7-minute client-only timer with an explicit "no backend expiry
 *  policy exists yet, this is a UI cue not a real deadline" comment; that
 *  backend policy now exists, so showing anything but the real value would
 *  be exactly the fabricated-data pattern CLAUDE.md forbids. No countdown
 *  is shown at all until the real booking (and its real `expiresAt`) has
 *  actually loaded from the poll below — never a placeholder number. */
export default function ConfirmedScreen(): React.JSX.Element {
  const { t, i18n } = useTranslation(['booking', 'activeTrip', 'common']);
  const locale = i18n.language as SupportedLocale;
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    vehicleLabel?: string;
    pickupLabel?: string;
    destinationLabel?: string;
  }>();
  const { colors: theme } = useAppTheme();
  const insets = useSafeAreaInsets();
  const driverFirstName = (params.driverName ?? t('common:terms.driver')).split(' ')[0]!;
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [cancelSheetVisible, setCancelSheetVisible] = useState(false);

  const bookingsPolling = useFocusAwarePolling(POLL_MS);
  const { data: bookings } = useListMyBookingsQuery(undefined, {
    skip: !params.bookingId,
    ...bookingsPolling,
  });
  const booking = bookings?.find((b) => b.id === params.bookingId);
  const expiresAtMs = booking?.expiresAt ? new Date(booking.expiresAt).getTime() : null;
  // Null (not a number) whenever the real deadline isn't known yet — the
  // render below only ever shows a countdown once this is a real number.
  const remainingMs = expiresAtMs !== null ? Math.max(0, expiresAtMs - nowMs) : null;

  const badgeScale = useRef(new Animated.Value(0)).current;
  const ringScale = useRef(new Animated.Value(0.6)).current;
  const ringOpacity = useRef(new Animated.Value(0.5)).current;

  useEffect(() => {
    Animated.spring(badgeScale, { toValue: 1, friction: 5, tension: 80, useNativeDriver: true }).start();
    Animated.loop(
      Animated.parallel([
        Animated.timing(ringScale, { toValue: 1.9, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(ringOpacity, { toValue: 0, duration: 1100, easing: Easing.out(Easing.ease), useNativeDriver: true }),
      ]),
    ).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (booking?.status === 'accepted') {
      haptics.success();
      router.replace({ pathname: '/bookings/pending', params });
    }
  }, [booking?.status, params]);

  const declined = booking?.status === 'declined' || booking?.status === 'expired';
  const isSameDay = (a: Date, b: Date): boolean => a.toDateString() === b.toDateString();
  const deadline = expiresAtMs !== null && remainingMs !== null && remainingMs > 0 ? new Date(expiresAtMs) : null;
  const deadlineLabel = deadline
    ? isSameDay(deadline, new Date(nowMs))
      ? t('booking:responseDeadline', { time: formatTime(deadline, locale) })
      : t('booking:responseDeadlineDay', {
          date: formatCalendarDate(deadline, toIntlTag(locale), { weekday: 'long', day: 'numeric', month: 'long' }),
          time: formatTime(deadline, locale),
        })
    : null;
  // The ride's real departure, from the polled booking — never the current
  // clock (this card used to render `new Date()` as if it were the ride time).
  const departure = booking?.ride?.departureAt ? new Date(booking.ride.departureAt) : null;
  const tone = declined
    ? { fill: theme.errorMuted, icon: theme.error, ring: theme.error }
    : { fill: theme.warningMuted, icon: theme.warning, ring: theme.warning };

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        topInset={insets.top}
        leading="close"
        onBack={() => router.replace('/(tabs)/explore')}
        backLabel={t('common:actions.close')}
        title={t('booking:requestSentTitle')}
        bordered={false}
      />

      <View style={styles.body}>
        <View style={styles.badgeWrap}>
          {!declined ? (
            <Animated.View
              style={[
                styles.ring,
                { borderColor: tone.ring, transform: [{ scale: ringScale }], opacity: ringOpacity },
              ]}
            />
          ) : null}
          <Animated.View style={[styles.badge, { backgroundColor: tone.fill, transform: [{ scale: badgeScale }] }]}>
            <Icon name={declined ? 'close' : 'hourglass-outline'} size="lg" color={tone.icon} />
          </Animated.View>
        </View>

        <Text variant="h2" color={theme.ink} align="center" style={styles.title}>
          {declined
            ? t('booking:declined_title', { name: driverFirstName })
            : t('booking:pending_title', { name: driverFirstName })}
        </Text>

        {declined ? (
          <Text variant="body" color={theme.inkMuted} align="center" style={styles.subtitle}>
            {t('booking:status_declined_hint')}
          </Text>
        ) : (
          <>
            <Text variant="body" color={theme.inkMuted} align="center" style={styles.subtitle}>
              {t('booking:status_pending_hint', { name: driverFirstName })}
            </Text>
            {deadlineLabel ? (
              <View style={[styles.deadlinePill, { backgroundColor: theme.warningMuted }]}>
                <Icon name="time-outline" size="xs" color={theme.warning} />
                <Text variant="label" color={theme.ink}>
                  {deadlineLabel}
                </Text>
              </View>
            ) : null}
            <Text variant="bodySmall" color={theme.inkFaint} align="center">
              {t('booking:status_pending_notification')}
            </Text>
          </>
        )}

        {params.pickupLabel && params.destinationLabel ? (
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={styles.summaryHeaderRow}>
              {departure ? (
                <View style={styles.summaryTimeRow}>
                  <Icon name="calendar-outline" size="xs" color={theme.inkMuted} />
                  <Text variant="caption" color={theme.inkMuted}>
                    {formatDateTime(departure, locale)}
                  </Text>
                </View>
              ) : (
                <View />
              )}
              {params.price ? (
                <Text variant="title" color={theme.ink}>
                  {formatCurrency(Number(params.price), locale)}
                </Text>
              ) : null}
            </View>
            <View style={styles.summaryRouteRow}>
              <View style={styles.summaryDotsCol}>
                <View style={[styles.summaryDot, styles.summaryDotOutline, { borderColor: theme.ink }]} />
                <View style={[styles.summaryLine, { backgroundColor: theme.outlineVariant }]} />
                <View style={[styles.summaryDot, { backgroundColor: theme.accent }]} />
              </View>
              <View style={styles.summaryTextCol}>
                <Text variant="body" color={theme.ink}>
                  {params.pickupLabel}
                </Text>
                <Text variant="body" color={theme.ink}>
                  {params.destinationLabel}
                </Text>
              </View>
            </View>
          </View>
        ) : null}
      </View>

      <View style={[styles.actions, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          size="lg"
          label={t('booking:backToResults')}
          onPress={() => router.dismissTo('/search/results')}
        />
        {!declined ? (
          <Button
            variant="ghost"
            label={t('booking:cancel_request')}
            onPress={() => setCancelSheetVisible(true)}
          />
        ) : null}
      </View>

      {params.bookingId ? (
        <CancellationSheet
          visible={cancelSheetVisible}
          onClose={() => setCancelSheetVisible(false)}
          bookingId={params.bookingId}
          role="rider"
          onCancelled={() => router.replace('/(tabs)/explore')}
        />
      ) : null}
    </View>
  );
}

const BADGE_SIZE = 84;
const RING_SIZE = 84;

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.xl,
    gap: spacing.sm,
  },
  badgeWrap: {
    width: RING_SIZE,
    height: RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  ring: {
    position: 'absolute',
    width: RING_SIZE,
    height: RING_SIZE,
    borderRadius: RING_SIZE / 2,
    borderWidth: 2,
  },
  badge: {
    width: BADGE_SIZE,
    height: BADGE_SIZE,
    borderRadius: BADGE_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    marginBottom: spacing.xs,
  },
  subtitle: {
    marginBottom: spacing.xs,
  },
  deadlinePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    marginBottom: spacing.xs,
  },
  summaryCard: {
    width: '100%',
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  summaryHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryTimeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  summaryRouteRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  summaryDotsCol: {
    width: 8,
    alignItems: 'center',
    paddingTop: 4,
  },
  summaryDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  summaryDotOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  summaryLine: {
    flex: 1,
    width: 2,
    marginVertical: 4,
  },
  summaryTextCol: {
    flex: 1,
    gap: spacing.md,
  },
  actions: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.lg,
    gap: spacing.xs,
  },
});
