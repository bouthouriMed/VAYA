import { View, StyleSheet } from 'react-native';
import { Text, Button, MapPreview, colors, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { CancellationSheet } from '../../src/features/bookings/CancellationSheet';
import { NoShowReportSheet } from '../../src/features/bookings/NoShowReportSheet';

export default function LiveScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    vehicleLabel?: string;
    destinationLabel?: string;
    estimatedDurationMin?: string;
    pickupLat?: string;
    pickupLng?: string;
    destinationLat?: string;
    destinationLng?: string;
  }>();
  const driverName = params.driverName ?? 'votre conducteur';
  // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md): trip-day
  // affordances for both directions of "this isn't happening as planned" —
  // cancelling outright, or reporting the driver never showed.
  const [cancelling, setCancelling] = useState(false);
  const [reportingNoShow, setReportingNoShow] = useState(false);
  const pickupCoord =
    params.pickupLat && params.pickupLng
      ? { latitude: Number(params.pickupLat), longitude: Number(params.pickupLng) }
      : undefined;
  const destinationCoord =
    params.destinationLat && params.destinationLng
      ? { latitude: Number(params.destinationLat), longitude: Number(params.destinationLng) }
      : undefined;

  useEffect(() => {
    // Phase 10: never auto-navigate away while the rider is mid-flow on a
    // cancellation or no-show report — those are exactly the moments this
    // presentational "trip is progressing" timer must not silently steal
    // the screen out from under.
    if (cancelling || reportingNoShow) return;
    const timer = setTimeout(
      () => router.replace({ pathname: '/bookings/settlement', params }),
      4000,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cancelling, reportingNoShow]);

  return (
    <View style={styles.container}>
      <MapPreview
        height={300}
        badge="● En route"
        origin={pickupCoord}
        destination={destinationCoord}
        style={styles.map}
      />

      <View style={styles.card}>
        <View style={styles.headerRow}>
          <Text variant="h1">
            {params.estimatedDurationMin ? `≈ ${params.estimatedDurationMin} min` : 'En route'}
          </Text>
          {params.bookingId ? (
            <Button
              label="Message"
              variant="outline"
              size="sm"
              accessibilityLabel={`Envoyer un message à ${driverName.split(' ')[0]}`}
              onPress={() =>
                router.push({
                  pathname: '/conversations/[bookingId]',
                  params: {
                    bookingId: params.bookingId!,
                    role: 'rider',
                    otherPartyName: driverName,
                  },
                })
              }
            />
          ) : null}
        </View>
        <Text variant="body" color={colors.gray600}>
          {/* Trip duration is the real, OSRM-computed route estimate — this
              is intentionally not a live countdown/arrival clock, since
              there's no real-time position feed to compute one from yet. */}
          {params.estimatedDurationMin ? 'Durée estimée du trajet' : 'Suivi en direct'}
          {params.destinationLabel ? ` · ${params.destinationLabel}` : ''}
        </Text>
        <View style={styles.track}>
          <View style={styles.trackFill} />
        </View>

        {params.bookingId ? (
          <View style={styles.tripActions}>
            <Button
              label="Le conducteur n’est pas arrivé"
              variant="ghost"
              size="sm"
              onPress={() => setReportingNoShow(true)}
            />
            <Button
              label="Annuler"
              variant="ghost"
              size="sm"
              onPress={() => setCancelling(true)}
            />
          </View>
        ) : null}
      </View>

      {params.bookingId ? (
        <>
          <CancellationSheet
            visible={cancelling}
            bookingId={params.bookingId}
            role="rider"
            onClose={() => setCancelling(false)}
            onCancelled={() => router.replace('/(tabs)/trips')}
          />
          <NoShowReportSheet
            visible={reportingNoShow}
            bookingId={params.bookingId}
            role="rider"
            counterpartName={driverName}
            onClose={() => setReportingNoShow(false)}
            onReported={() => router.replace('/(tabs)/trips')}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  map: {
    borderRadius: 0,
    flex: 1,
  },
  card: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    padding: spacing.xl,
    gap: spacing.xs,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  tripActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.sm,
  },
  track: {
    height: 6,
    borderRadius: radii.full,
    backgroundColor: colors.gray200,
    overflow: 'hidden',
    marginTop: spacing.sm,
  },
  trackFill: {
    width: '46%',
    height: '100%',
    backgroundColor: colors.secondary,
    borderRadius: radii.full,
  },
  footnote: {
    marginTop: spacing.sm,
  },
});
