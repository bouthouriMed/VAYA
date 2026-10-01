import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, Card, Icon, useAppTheme, spacing } from '@vaya/design-system';
import type { SupportedLocale } from '@vaya/config';
import { formatCurrency } from '../../src/utils/localeFormat';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  useCompleteTripMutation,
  useCreateTripRatingMutation,
  useGetTripByBookingQuery,
} from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';
import { submitRating } from '../../src/features/ratings/ratingHelpers';
import { RatingPromptSheet } from '../../src/features/ratings/RatingPromptSheet';

export default function SettlementScreen(): React.JSX.Element {
  const { t, i18n } = useTranslation(['booking', 'activeTrip', 'common']);
  const { colors: theme } = useAppTheme();
  const { bookingId, driverName, price, destinationLabel } = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    destinationLabel?: string;
  }>();
  const firstName = (driverName ?? t('common:terms.driver')).split(' ')[0]!;
  const insets = useSafeAreaInsets();
  const priceLabel = price ? formatCurrency(Number(price), i18n.language as SupportedLocale) : '\u2014';

  const { data: trip } = useGetTripByBookingQuery(bookingId ?? '', { skip: !bookingId });
  const [completeTrip] = useCompleteTripMutation();
  const [createRating] = useCreateTripRatingMutation();
  const [sheetVisible, setSheetVisible] = useState(false);
  const [sheetDone, setSheetDone] = useState(false);
  const completionAttempted = useRef(false);

  // The trip-progress flow up to here (pending -> pickup -> live) is still a
  // presentational mock with no live position feed (live.tsx's own
  // comment) — reaching settlement.tsx is, today, the one moment the app
  // actually witnesses a trip's real end. So this is where the minimal
  // trip-completion trigger (trips.service.ts's completeTrip,
  // docs/roadmap/phase-09-ratings-trust.md's required prerequisite) fires
  // — best-effort and idempotent-safe (a second call while already
  // `completed` 409s harmlessly and is ignored) rather than gating the
  // screen on it succeeding, since the passenger's arrival experience
  // shouldn't hang on this side effect.
  useEffect(() => {
    if (!trip || completionAttempted.current) return;
    completionAttempted.current = true;
    if (trip.status === 'completed') {
      setSheetVisible(true);
      return;
    }
    completeTrip(trip.id)
      .unwrap()
      .then(() => setSheetVisible(true))
      .catch(() => {
        // Already completed by the other party, or a transient failure —
        // either way, still worth offering the rating prompt if the trip
        // data we already have suggests it's over. If truly not completed,
        // the global RatingPromptBridge will pick it up once the driver
        // (or a retry) does complete it.
        setSheetVisible(true);
      });
  }, [trip, completeTrip]);

  useEffect(() => {
    if (sheetVisible) {
      trackEvent('rating_prompted', { bookingId: bookingId ?? '', context: 'settlement' });
    }
  }, [sheetVisible, bookingId]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing['3xl'] }]}>
        <View style={[styles.heroIcon, { backgroundColor: theme.accentGlow + '55' }]}>
          <Icon name="flag-outline" size="lg" color={theme.accentStrong} />
        </View>
        <Text variant="h2" color={theme.ink} align="center">
          {destinationLabel ? t('booking:arrivedAt', { place: destinationLabel }) : t('booking:arrived')}
        </Text>
      </View>

      <View style={styles.body}>
        <Card style={styles.settleCard}>
          <Text variant="title" color={theme.ink}>
            {t('booking:settlement_title', { name: firstName })}
          </Text>
          <View style={styles.settleRow}>
            <Text variant="bodySmall" color={theme.inkMuted} style={styles.settleText}>
              {t('booking:settlement_pay', { price: priceLabel, name: firstName })}
            </Text>
            <Text variant="h3" color={theme.ink}>
              {priceLabel}
            </Text>
          </View>
        </Card>

        <Text variant="bodySmall" color={sheetDone ? theme.accentStrong : theme.inkMuted} align="center">
          {sheetDone ? t('booking:ratingThanks', { name: firstName }) : t('booking:rate_prompt', { name: firstName })}
        </Text>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        {!sheetDone ? (
          <Button label={t('booking:rateCta', { name: firstName })} variant="secondary" onPress={() => setSheetVisible(true)} />
        ) : null}
        <Button label={t('booking:finish')} size="lg" onPress={() => router.replace('/(tabs)/explore')} />
      </View>

      <RatingPromptSheet
        visible={sheetVisible}
        onClose={() => setSheetVisible(false)}
        role="rider_rates_driver"
        counterpartName={driverName ?? null}
        onSubmit={async ({ stars, punctualityFlag, comment }) => {
          if (!trip) return;
          await submitRating(
            { stars, punctualityFlag, comment },
            {
              createRating: (input) => createRating({ tripId: trip.id, input }).unwrap(),
              trackEvent,
              role: 'rider_rates_driver',
            },
          );
          setSheetVisible(false);
          setSheetDone(true);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.xl,
  },
  heroIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  body: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  settleCard: {
    gap: spacing.sm,
  },
  settleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: spacing.md,
  },
  settleText: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
});
