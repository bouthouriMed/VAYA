import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar, colors, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { getDriverByKey, PICKUP_LABEL } from '../../src/mocks/seed-data';

export default function PendingScreen(): React.JSX.Element {
  const { driverId } = useLocalSearchParams<{ driverId?: string }>();
  const driver = getDriverByKey(driverId);

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Avatar name={driver.fullName} size="lg" />
        <Text variant="h2" style={styles.joinLabel}>
          Rejoindre {driver.fullName.split(' ')[0]}
        </Text>
      </View>

      <Button
        label={`Rejoindre ${driver.fullName.split(' ')[0]}`}
        size="lg"
        onPress={() => router.push({ pathname: '/bookings/pickup', params: { driverId } })}
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
            Confiance de {driver.fullName.split(' ')[0]}
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
            {driver.priceDt} DT
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
