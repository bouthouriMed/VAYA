import { useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  Button,
  Avatar,
  Card,
  MapPreview,
  ScreenHeader,
  useAppTheme,
  spacing,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';
import { fullPlaceLabel, shortenPlaceLabel } from '../../src/utils/placeLabel';
import { openDirections } from '../../src/utils/openInMaps';

/** Head-to-the-pickup step of the rider's trip flow (after acceptance). */
export default function PickupScreen(): React.JSX.Element {
  const { t } = useTranslation(['booking', 'activeTrip', 'common']);
  const insets = useSafeAreaInsets();
  const { colors: theme, scheme } = useAppTheme();
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    driverUserId?: string;
    price?: string;
    vehicleLabel?: string;
    pickupLabel?: string;
    pickupLat?: string;
    pickupLng?: string;
  }>();
  const driverName = params.driverName ?? t('common:terms.driver');
  const firstName = driverName.split(' ')[0]!;
  const pickupCoord =
    params.pickupLat && params.pickupLng
      ? { latitude: Number(params.pickupLat), longitude: Number(params.pickupLng) }
      : undefined;
  const pickupTitle = params.pickupLabel ? shortenPlaceLabel(params.pickupLabel) : undefined;
  const pickupAddress = params.pickupLabel ? fullPlaceLabel(params.pickupLabel) : undefined;
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md).
  const [cancelling, setCancelling] = useState(false);

  const avatar = <Avatar name={driverName} size="md" />;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        topInset={insets.top}
        onBack={() => router.back()}
        backLabel={t('common:actions.back')}
        title={t('booking:pickupTitle')}
      />

      <View style={styles.body}>
        {/* No distance/ETA badge: nothing computes a real one on this screen
            — showing a fabricated "120 m · 2 min" was the exact
            anti-pattern Phase 1 removed. */}
        <MapPreview height={220} origin={pickupCoord} isDark={scheme === 'dark'} />

        {/* Where to go, then how to get there: the place, its full
         *  address only when it adds something, and walking directions —
         *  the one thing to do before "I've arrived". */}
        <Card style={styles.pickupCard}>
          <Text variant="caption" color={theme.inkMuted}>
            {t('booking:pickupPointLabel')}
          </Text>
          <Text variant="title" color={theme.ink}>
            {pickupTitle ?? t('booking:waiting_confirmation')}
          </Text>
          {pickupAddress && pickupAddress !== pickupTitle ? (
            <Text variant="bodySmall" color={theme.inkMuted}>
              {pickupAddress}
            </Text>
          ) : null}
          {pickupCoord ? (
            <Button
              label={t('booking:walkToPickup')}
              icon="walk-outline"
              variant="secondary"
              size="sm"
              onPress={() =>
                void openDirections({
                  destination: { lat: pickupCoord.latitude, lng: pickupCoord.longitude },
                  travelMode: 'walking',
                })
              }
              style={styles.directionsButton}
            />
          ) : null}
        </Card>

        <Card style={styles.driverRow}>
          {params.driverUserId ? (
            <TouchableOpacity
              onPress={() =>
                router.push({
                  pathname: '/search/trust',
                  params: { driverUserId: params.driverUserId!, bookingId: params.bookingId },
                })
              }
              hitSlop={6}
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.viewProfile', { name: driverName })}
            >
              {avatar}
            </TouchableOpacity>
          ) : (
            avatar
          )}
          <View style={styles.driverText}>
            {/* The person you're meeting first, then the car to look for. */}
            <Text variant="label" color={theme.ink}>
              {firstName}
            </Text>
            <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={1}>
              {params.vehicleLabel ?? t('booking:phase.confirmed')}
            </Text>
          </View>
          {params.bookingId ? (
            <Button
              label={t('common:actions.message')}
              icon="chatbubble-outline"
              variant="secondary"
              size="sm"
              accessibilityLabel={t('common:actions.message', { name: firstName })}
              onPress={() =>
                router.push({
                  pathname: '/conversations/[bookingId]',
                  params: { bookingId: params.bookingId!, role: 'rider', otherPartyName: driverName },
                })
              }
            />
          ) : null}
        </Card>
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.lg }]}>
        <Button
          label={t('activeTrip:arrived')}
          size="lg"
          onPress={() => router.push({ pathname: '/bookings/live', params })}
        />
        {params.bookingId ? (
          <Button label={t('booking:cancelBooking')} variant="ghost" onPress={() => setCancelling(true)} />
        ) : null}
      </View>

      {params.bookingId ? (
        <CancellationSheet
          visible={cancelling}
          bookingId={params.bookingId}
          role="rider"
          onClose={() => setCancelling(false)}
          onCancelled={() => router.replace('/(tabs)/trips')}
        />
      ) : null}
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
    gap: spacing.md,
  },
  pickupCard: {
    gap: 2,
  },
  directionsButton: {
    alignSelf: 'flex-start',
    marginTop: spacing.sm,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverText: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
});
