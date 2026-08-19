import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar, colors, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { PICKUP_LABEL } from '../../src/mocks/seed-data';

export default function PendingScreen(): React.JSX.Element {
  const params = useLocalSearchParams<{
    bookingId?: string;
    driverName?: string;
    price?: string;
    vehicleLabel?: string;
  }>();
  const driverName = params.driverName ?? 'votre conducteur';
  const firstName = driverName.split(' ')[0]!;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Avatar name={driverName} size="lg" />
        <Text variant="h2" style={styles.joinLabel}>
          Rejoindre {firstName}
        </Text>
      </View>

      <Button
        label={`Rejoindre ${firstName}`}
        size="lg"
        onPress={() => router.push({ pathname: '/bookings/pickup', params })}
        style={styles.cta}
      />

      <View style={styles.card}>
        <Text variant="label">Modèle d&apos;incertitude</Text>
        <View style={styles.row}>
          <Text variant="bodySmall" color={colors.gray600}>
            Fenêtre de prise en charge
          </Text>
          <Text variant="bodySmall" color={colors.gray900}>
            18:05 – 18:15
          </Text>
        </View>
        <View style={styles.row}>
          <Text variant="bodySmall" color={colors.gray600}>
            Confiance de {firstName}
          </Text>
          <Text variant="bodySmall" color={colors.gray900}>
            Élevée
          </Text>
        </View>
        <View style={styles.row}>
          <Text variant="bodySmall" color={colors.gray600}>
            Point de rendez-vous
          </Text>
          <Text variant="bodySmall" color={colors.gray900}>
            {PICKUP_LABEL}
          </Text>
        </View>
        <View style={styles.row}>
          <Text variant="bodySmall" color={colors.gray600}>
            Contribution
          </Text>
          <Text variant="bodySmall" color={colors.gray900}>
            {params.price ?? '—'} DT
          </Text>
        </View>
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
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
  },
  joinLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  cta: {
    width: '100%',
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    gap: spacing.sm,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
});
