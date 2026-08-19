import { View, StyleSheet } from 'react-native';
import { Text, MapPreview, colors, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect } from 'react';

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
  const pickupCoord =
    params.pickupLat && params.pickupLng
      ? { latitude: Number(params.pickupLat), longitude: Number(params.pickupLng) }
      : undefined;
  const destinationCoord =
    params.destinationLat && params.destinationLng
      ? { latitude: Number(params.destinationLat), longitude: Number(params.destinationLng) }
      : undefined;

  useEffect(() => {
    const timer = setTimeout(
      () => router.replace({ pathname: '/bookings/settlement', params }),
      4000,
    );
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
        <Text variant="h1">
          {params.estimatedDurationMin ? `≈ ${params.estimatedDurationMin} min` : 'En route'}
        </Text>
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
      </View>
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
