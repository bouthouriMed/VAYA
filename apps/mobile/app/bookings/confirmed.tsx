import { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, View, StyleSheet, TouchableOpacity, Easing } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Icon, useAppTheme, spacing, radii, haptics } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useListMyBookingsQuery, useCancelBookingMutation } from '../../src/state/api';

const REQUEST_WINDOW_MS = 7 * 60_000;
// How often to re-poll bookings while waiting for a driver response. There
// is no push/websocket channel into this specific screen — Phase 7's push
// notifications tell the *device*, but this screen needs its own state to
// react to, hence the poll.
const POLL_MS = 5000;

/** Stitch's "Request Sent" — this used to be a 1.6s auto-advancing
 *  animation that assumed acceptance; it's now a real held screen that
 *  polls the booking's actual status and only advances once a driver has
 *  really accepted. The on-screen countdown is visual only — no backend
 *  expiry policy exists yet for a booking request, so nothing enforces it
 *  server-side; it's a UI cue, not a real deadline. */
export default function ConfirmedScreen(): React.JSX.Element {
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
  const driverFirstName = (params.driverName ?? 'votre conducteur').split(' ')[0]!;
  const deadline = useMemo(() => Date.now() + REQUEST_WINDOW_MS, []);
  const [remainingMs, setRemainingMs] = useState(REQUEST_WINDOW_MS);
  const [cancelling, setCancelling] = useState(false);
  const [cancelBooking, { isLoading: isCancelling }] = useCancelBookingMutation();

  const { data: bookings } = useListMyBookingsQuery(undefined, {
    skip: !params.bookingId,
    pollingInterval: POLL_MS,
  });
  const booking = bookings?.find((b) => b.id === params.bookingId);

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
    const timer = setInterval(() => setRemainingMs(Math.max(0, deadline - Date.now())), 1000);
    return () => clearInterval(timer);
  }, [deadline]);

  useEffect(() => {
    if (booking?.status === 'accepted') {
      haptics.success();
      router.replace({ pathname: '/bookings/pending', params });
    }
  }, [booking?.status, params]);

  const declined = booking?.status === 'declined' || booking?.status === 'expired';
  const minutes = Math.floor(remainingMs / 60_000);
  const seconds = Math.floor((remainingMs % 60_000) / 1000)
    .toString()
    .padStart(2, '0');

  async function handleCancel(): Promise<void> {
    if (!params.bookingId || isCancelling) return;
    setCancelling(true);
    try {
      await cancelBooking(params.bookingId).unwrap();
      router.replace('/(tabs)/explore');
    } catch {
      setCancelling(false);
    }
  }

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
          accessibilityLabel="Fermer"
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
          {declined ? `${driverFirstName} n'a pas pu accepter` : `Demande envoyée à ${driverFirstName}`}
        </Text>

        {declined ? (
          <Text variant="body" color={theme.inkMuted} align="center" style={styles.subtitle}>
            Retournez aux résultats pour choisir un autre conducteur.
          </Text>
        ) : (
          <>
            <Text variant="body" color={theme.inkMuted} align="center" style={styles.subtitle}>
              {driverFirstName} a jusqu&apos;à{' '}
              <Text variant="body" color={theme.ink} style={styles.bold}>
                {minutes}:{seconds}
              </Text>{' '}
              pour répondre.
            </Text>
            <Text variant="bodySmall" color={theme.inkFaint} align="center">
              Vous serez averti dès qu&apos;il répond.
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
          accessibilityLabel="Retour aux résultats"
        >
          <Text variant="label" color={theme.onInk}>
            Retour aux résultats
          </Text>
        </TouchableOpacity>
        {!declined ? (
          <TouchableOpacity
            style={styles.ghostBtn}
            onPress={() => void handleCancel()}
            disabled={cancelling}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Annuler la demande"
          >
            <Text variant="label" color={theme.inkFaint}>
              {cancelling ? 'Annulation…' : 'Annuler la demande'}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>
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
