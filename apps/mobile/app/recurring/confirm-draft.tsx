import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Button,
  FieldCard,
  FieldRow,
  PriceRangeStepper,
  Text,
  colors,
  spacing,
  haptics,
} from '@vaya/design-system';
import {
  useListMyRecurringPatternsQuery,
  useGetMyDriverProfileQuery,
  useCreateRideMutation,
  useUpdateRideMutation,
  usePublishRideMutation,
  type SuggestedPrice,
} from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';
import {
  AUTO_DRAFT_DEFAULT_SEATS,
  buildAutoDraftDepartureAt,
  formatDaysOfWeek,
  formatTimeWindow,
} from '../../src/features/recurring/recurringHelpers';
import { useTranslation } from 'react-i18next';

/**
 * Driver auto-draft confirmation flow
 * (docs/roadmap/phase-11-recurring-rides.md: "the app auto-drafts (never
 * auto-publishes) a ride for the matching day/time, requiring explicit
 * same-day confirmation" / "a lightweight... flow reusing
 * driver/publish.tsx's later steps, pre-filled"). Deliberately a single
 * screen, not the full 3-step publish.tsx flow — the whole point of a
 * recurring pattern is skipping repeated manual effort, so this reuses
 * only the price step's shape (PriceRangeStepper, pre-filled at the
 * server's `recommended`) and skips candidate-stop selection entirely
 * (`rides.service.ts`/`stop-candidates.service.ts` already make publishing
 * with zero additional stops a fully valid choice). A driver who wants
 * finer control over stops can still use the full manual publish flow.
 *
 * Reuses the existing ride-creation endpoints (createRide/updateRide/
 * publishRide) exactly as scoped — never a bespoke "confirm auto-draft"
 * endpoint.
 */
export default function ConfirmAutoDraftScreen(): React.JSX.Element {
  const { t } = useTranslation('booking');
  const { patternId } = useLocalSearchParams<{ patternId: string }>();
  const { data: patterns } = useListMyRecurringPatternsQuery();
  const pattern = patterns?.find((p) => p.id === patternId) ?? null;

  const { data: driverProfile, isLoading: isProfileLoading } = useGetMyDriverProfileQuery();
  const [createRide] = useCreateRideMutation();
  const [updateRide, { isLoading: isUpdatingPrice }] = useUpdateRideMutation();
  const [publishRide, { isLoading: isPublishing }] = usePublishRideMutation();

  const [rideId, setRideId] = useState<string | null>(null);
  const [pricing, setPricing] = useState<SuggestedPrice | null>(null);
  const [price, setPrice] = useState(0);
  const [isDrafting, setIsDrafting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const vehicle = driverProfile?.vehicles[0];

  useEffect(() => {
    if (!pattern || !vehicle || rideId || isDrafting) return;
    setIsDrafting(true);
    setErrorMessage(undefined);
    createRide({
      vehicleId: vehicle.id,
      origin: { label: pattern.originLabel, lat: pattern.originLat, lng: pattern.originLng },
      destination: {
        label: pattern.destinationLabel,
        lat: pattern.destinationLat,
        lng: pattern.destinationLng,
      },
      departureAt: buildAutoDraftDepartureAt(pattern),
      seatsTotal: AUTO_DRAFT_DEFAULT_SEATS,
      recurringPatternId: pattern.id,
    })
      .unwrap()
      .then((ride) => {
        setRideId(ride.id);
        setPricing(ride.pricing);
        setPrice(ride.pricing.recommended);
      })
      .catch(() => {
        setErrorMessage(t('recurring.draftError'));
      })
      .finally(() => setIsDrafting(false));
    // Deliberately runs only when the pattern/vehicle first become
    // available, not on every isDrafting/createRide identity change — this
    // draft-creation effect must fire exactly once per screen visit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pattern, vehicle]);

  async function handleConfirm(): Promise<void> {
    if (!rideId || !pricing || !pattern) return;
    setErrorMessage(undefined);
    try {
      if (price !== pricing.recommended) {
        await updateRide({ rideId, input: { contributionPerSeat: price } }).unwrap();
      }
      await publishRide(rideId).unwrap();
      haptics.success();
      trackEvent('recurring_auto_draft_confirmed', { patternId: pattern.id, rideId, role: pattern.role });
      router.replace('/(tabs)/trips');
    } catch {
      haptics.error();
      setErrorMessage(t('recurring.publishError'));
    }
  }

  if (isProfileLoading || !pattern) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!vehicle) {
    return (
      <View style={styles.container}>
        <Text variant="bodySmall" color={colors.error} style={styles.padded}>
          {t('recurring.noVehicleError')}
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h3">{t('recurring.confirmTitle')}</Text>
        <Text variant="bodySmall" color={colors.gray600}>
          {t('recurring.confirmDescription')}
        </Text>
      </View>

      <FieldCard>
        <FieldRow label={t('recurring.departure')} value={pattern.originLabel} dotColor={colors.secondary} />
        <FieldRow label={t('recurring.arrival')} value={pattern.destinationLabel} dotColor={colors.primary} dotFilled={false} />
        <FieldRow
          label={t('recurring.usualSchedule')}
          value={`${formatDaysOfWeek(pattern.daysOfWeekMask, t)} · ${formatTimeWindow(pattern.timeWindowStart, pattern.timeWindowEnd)}`}
          last
        />
      </FieldCard>

      {isDrafting || !pricing ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      ) : (
        <View style={styles.priceBody}>
          <PriceRangeStepper
            min={pricing.min}
            max={pricing.max}
            recommended={pricing.recommended}
            value={price}
            onChange={setPrice}
          />
        </View>
      )}

      {errorMessage ? (
        <Text variant="bodySmall" color={colors.error} align="center">
          {errorMessage}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Button
          label="Confirmer et publier"
          size="lg"
          loading={isUpdatingPrice || isPublishing}
          disabled={!rideId || !pricing}
          onPress={() => void handleConfirm()}
          style={styles.cta}
        />
        <Button label="Annuler" variant="ghost" size="lg" onPress={() => router.back()} style={styles.cta} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    gap: spacing.xs,
  },
  priceBody: {
    gap: spacing.md,
  },
  footer: {
    gap: spacing.sm,
    marginTop: 'auto',
  },
  cta: {
    width: '100%',
  },
  padded: {
    padding: spacing.lg,
  },
});
