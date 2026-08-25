import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, Button, colors, spacing, radii } from '@vaya/design-system';
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
  const { t } = useTranslation(['booking', 'activeTrip', 'common']);
  const { bookingId, driverName, price, destinationLabel } = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    destinationLabel?: string;
  }>();
  const firstName = (driverName ?? t('common:terms.driver')).split(' ')[0]!;
  const insets = useSafeAreaInsets();

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
    <View style={styles.container}>
      <View style={[styles.hero, { paddingTop: insets.top + spacing['3xl'] }]}>
        <Text variant="h1" color={colors.navyText} align="center">
          {t('booking:arrival')}{destinationLabel ? ` ${destinationLabel}` : ''}.
        </Text>
      </View>

      <View style={styles.sheet}>
        <Text variant="h3">{t('booking:settlement_title', { name: firstName })}</Text>

        <View style={styles.settleRow}>
          <Text variant="bodySmall" color={colors.gray600}>
            {t('booking:settlement_pay', { price: price ?? '\u2014', name: firstName })}
          </Text>
          <Text variant="h3">{price ?? '\u2014'} DT</Text>
        </View>

        {sheetDone ? (
          <Text variant="bodySmall" color={colors.success}>
            {t('booking:rate_prompt', { name: firstName })}
          </Text>
        ) : (
          <Text variant="bodySmall" color={colors.gray600}>
            {t('booking:rate_prompt', { name: firstName })}
          </Text>
        )}

        <Button
          label={t('booking:finish')}
          size="lg"
          onPress={() => router.replace('/(tabs)/explore')}
          style={styles.cta}
        />
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
    backgroundColor: colors.gray100,
  },
  hero: {
    backgroundColor: colors.navySurface,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing['4xl'],
  },
  sheet: {
    flex: 1,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    marginTop: -radii['2xl'],
    padding: spacing.xl,
    gap: spacing.md,
  },
  settleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.gray100,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  cta: {
    width: '100%',
    marginTop: 'auto',
  },
});
