import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar, MapPreview, colors, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { PICKUP_LABEL } from '../../src/mocks/seed-data';

export default function PickupScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    vehicleLabel?: string;
  }>();
  const driverName = params.driverName ?? 'votre conducteur';

  return (
    <View style={styles.container}>
      <MapPreview height={220} badge="120 m · 2 min à pied" />

      <View style={styles.card}>
        <Text variant="label" color={colors.gray600}>
          Rendez-vous
        </Text>
        <Text variant="h3">{PICKUP_LABEL}</Text>
      </View>

      <View style={styles.driverRow}>
        <Avatar name={driverName} size="md" />
        <View style={styles.driverText}>
          <Text variant="label">
            {params.vehicleLabel ? `${params.vehicleLabel} · ` : ''}
            {driverName.split(' ')[0]}
          </Text>
          <Text variant="bodySmall" color={colors.gray600}>
            En approche
          </Text>
        </View>
      </View>

      <Button
        label="Je suis arrivé"
        size="lg"
        onPress={() => router.push({ pathname: '/bookings/live', params })}
        style={styles.cta}
      />
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
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    gap: 2,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  driverText: {
    flex: 1,
  },
  cta: {
    width: '100%',
    marginTop: 'auto',
  },
});
