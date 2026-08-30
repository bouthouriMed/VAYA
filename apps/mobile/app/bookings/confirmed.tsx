import { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, TouchableOpacity, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Icon, useAppTheme, spacing, radii, haptics } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useListMyBookingsQuery } from '../../src/state/api';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';

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
  const { t } = useTranslation(['booking', 'activeTrip', 'common']);
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

  const { data: bookings } = useListMyBookingsQuery(undefined, {
    skip: !params.bookingId,
    pollingInterval: POLL_MS,
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
  const minutes = remainingMs !== null ? Math.floor(remainingMs / 60_000) : null;
  const seconds =
    remainingMs !== null
      ? Math.floor((remainingMs % 60_000) / 1000)
          .toString()
          .padStart(2, '0')
      : null;


  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {/* headerShown: false for this route (bookings/_layout) — the OS
       *  status bar has no native header above it, so the first row must
       *  clear insets.top itself. */}
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={() => router.replace('/(tabs)/explore')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.close')}
        >
          <Ionicons name="close" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink}>
          Vaya
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <View style={styles.body}>
        <View style={styles.badgeWrap}>
          <Animated.View
            style={[
              styles.ring,
              { borderColor: theme.accent, transform: [{ scale: ringScale }], opacity: ringOpacity },
            ]}
          />
          <Animated.View style={[styles.badge, { backgroundColor: theme.accent, transform: [{ scale: badgeScale }] }]}>
            <Ionicons name={declined ? 'close' : 'checkmark'} size={40} color={theme.onAccent} />
          </Animated.View>
        </View>

        <Text variant="h1" color={theme.ink} align="center" style={styles.title}>
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
              {minutes !== null && seconds !== null ? (
                <>
                  {' '}
                  <Text variant="body" color={theme.ink} style={styles.bold}>
                    {minutes}:{seconds}
                  </Text>
                </>
              ) : null}
            </Text>
            <Text variant="bodySmall" color={theme.inkFaint} align="center">
              {t('booking:status_pending_notification')}
            </Text>
          </>
        )}

        {params.pickupLabel && params.destinationLabel ? (
          <View style={[styles.summaryCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={styles.summaryHeaderRow}>
              <View style={styles.summaryTimeRow}>
                <Icon name="time-outline" size="xs" color={theme.inkFaint} />
                <Text variant="caption" color={theme.inkFaint}>
                  {new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
              {params.price ? (
                <Text variant="h3" color={theme.accent}>
                  {params.price} DT
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

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.ink }]}
          onPress={() => router.dismissTo('/search/results')}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={t('booking:backToResults')}
        >
          <Text variant="label" color={theme.onInk}>
            {t('booking:backToResults')}
          </Text>
        </TouchableOpacity>
        {!declined ? (
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => setCancelSheetVisible(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('booking:cancel_request')}
          >
            <Text variant="label" color={theme.inkFaint}>
              {t('booking:cancel_request')}
            </Text>
          </TouchableOpacity>
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
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
  bold: {
    fontWeight: '700',
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
    padding: spacing.lg,
    gap: spacing.sm,
  },
  primaryBtn: {
    height: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostBtn: {
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
