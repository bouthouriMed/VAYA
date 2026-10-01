import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import {
  Button,
  FieldCard,
  FieldRow,
  PriceRangeStepper,
  ScreenHeader,
  StateView,
  Text,
  useAppTheme,
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
import { usePriceStepperProps } from '../../src/features/driver-publish/usePriceStepperProps';

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
  const { t } = useTranslation(['booking', 'common', 'driver']);
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const priceStepperProps = usePriceStepperProps();
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
        setErrorMessage(t('booking:recurring.draftError'));
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
      setErrorMessage(t('booking:recurring.publishError'));
    }
  }

  const header = (
    <ScreenHeader
      topInset={insets.top}
      onBack={() => router.back()}
      backLabel={t('common:actions.back')}
      title={t('booking:recurring.confirmTitle')}
    />
  );

  if (isProfileLoading || !pattern || !vehicle) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        {header}
        {isProfileLoading || !pattern ? (
          <StateView status="loading" skeleton="detail" />
        ) : (
          <StateView
            status="empty"
            iconName="car-outline"
            title={t('booking:recurring.noVehicleError')}
            actionLabel={t('common:actions.back')}
            onAction={() => router.back()}
          />
        )}
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {header}
      <View style={styles.body}>
        <Text variant="bodySmall" color={theme.inkMuted}>
          {t('booking:recurring.confirmDescription')}
        </Text>

        <FieldCard>
          <FieldRow label={t('booking:recurring.departure')} value={pattern.originLabel} />
          <FieldRow label={t('booking:recurring.arrival')} value={pattern.destinationLabel} dotColor={theme.ink} dotFilled={false} />
          <FieldRow
            label={t('booking:recurring.usualSchedule')}
            value={`${formatDaysOfWeek(pattern.daysOfWeekMask, t)} · ${formatTimeWindow(pattern.timeWindowStart, pattern.timeWindowEnd)}`}
            last
          />
        </FieldCard>

        {isDrafting || !pricing ? (
          <StateView status="loading" skeleton="cards" />
        ) : (
          <PriceRangeStepper
            min={pricing.min}
            max={pricing.max}
            recommended={pricing.recommended}
            value={price}
            onChange={setPrice}
            label={t('driver:publish.priceStep.contributionLabel')}
            {...priceStepperProps}
          />
        )}

        {errorMessage ? (
          <Text variant="bodySmall" color={theme.error} align="center">
            {errorMessage}
          </Text>
        ) : null}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label={t('booking:recurring.confirmPublish')}
          size="lg"
          loading={isUpdatingPrice || isPublishing}
          disabled={!rideId || !pricing}
          onPress={() => void handleConfirm()}
        />
        <Button label={t('common:actions.cancel')} variant="ghost" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  body: {
    flex: 1,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  footer: {
    gap: spacing.xs,
    paddingHorizontal: spacing.lg,
  },
});
