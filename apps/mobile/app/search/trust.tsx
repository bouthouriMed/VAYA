import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar, Chip, Meter, colors, spacing, radii } from '@vaya/design-system';
import { router } from 'expo-router';
import { DRIVERS, CONTRIBUTION_DT } from '../../src/mocks/seed-data';

export default function TrustScreen(): React.JSX.Element {
  const driver = DRIVERS.sarra!;

  return (
    <View style={styles.container}>
      <View style={styles.hero}>
        <Avatar name={driver.fullName} size="lg" />
        <Text variant="h3">
          {driver.fullName.split(' ')[0]} ({driver.ratingAvg.toFixed(1)}★)
        </Text>
        <Text variant="bodySmall" color={colors.gray600}>
          {driver.tripCount} trajets
        </Text>
      </View>

      <View style={styles.card}>
        <Text variant="label">Trajet habituel</Text>
        <Text variant="bodySmall" color={colors.gray600}>
          El Menzah 5 → Tunis Digital Center
        </Text>
        <Text variant="bodySmall" color={colors.gray600}>
          Connue pour sa ponctualité.
        </Text>
      </View>

      <View style={styles.card}>
        <Meter label="Fiabilité" valueRatio={driver.reliabilityScore} />
        <Meter label="Ponctualité" valueRatio={driver.punctualityScore} />
        {driver.mutualContext ? (
          <Chip label={`Contexte partagé : ${driver.mutualContext}`} />
        ) : null}
      </View>

      <View style={styles.footer}>
        <Text variant="bodySmall" color={colors.gray600} align="center">
          La contribution se règle directement avec votre conducteur.
        </Text>
        <Button
          label={`Demander une place · ${CONTRIBUTION_DT} DT`}
          size="lg"
          onPress={() => router.push('/bookings/pending')}
          style={styles.cta}
        />
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
    gap: spacing.xs,
    paddingVertical: spacing.lg,
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
  footer: {
    marginTop: 'auto',
    gap: spacing.sm,
  },
  cta: {
    width: '100%',
  },
});
