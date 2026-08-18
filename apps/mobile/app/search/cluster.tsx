import { View, StyleSheet } from 'react-native';
import { Text, Button, Avatar, MapPreview, colors, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { CLUSTERS, DRIVERS } from '../../src/mocks/seed-data';

export default function ClusterScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const cluster = CLUSTERS.find((c) => c.id === id) ?? CLUSTERS[0]!;
  const candidates = cluster.driverIds.map((key) => DRIVERS[key]!);

  return (
    <View style={styles.container}>
      <MapPreview height={220} badge={cluster.label} />

      <View style={styles.list}>
        {candidates.map((driver) => (
          <View key={driver.id} style={styles.row}>
            <Avatar name={driver.fullName} size="md" />
            <View style={styles.rowText}>
              <Text variant="label">{driver.fullName}</Text>
              <Text variant="bodySmall" color={colors.gray600}>
                Est en mouvement
              </Text>
            </View>
            <Text variant="label" color={colors.gray900}>
              ★ {driver.ratingAvg}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.footer}>
        <Text variant="h3">{cluster.label}</Text>
        <Text variant="body" color={colors.gray600}>
          11 min d&apos;attente
        </Text>
        <Button
          label={cluster.label}
          size="lg"
          onPress={() => router.push('/search/trust')}
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
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  rowText: {
    flex: 1,
  },
  footer: {
    marginTop: 'auto',
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    gap: spacing.xs,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  cta: {
    width: '100%',
    marginTop: spacing.sm,
  },
});
