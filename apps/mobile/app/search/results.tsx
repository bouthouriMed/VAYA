import { View, StyleSheet } from 'react-native';
import { Text, Button, ClusterMarker, colors, spacing, radii } from '@vaya/design-system';
import { router } from 'expo-router';
import { CLUSTERS, DRIVERS } from '../../src/mocks/seed-data';

const totalPeople = CLUSTERS.reduce((sum, c) => sum + c.driverIds.length, 0);

export default function ResultsScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h2">{totalPeople} personnes se dirigent dans votre direction.</Text>
        <Text variant="body" color={colors.gray600}>
          {CLUSTERS.length} groupes disponibles.
        </Text>
      </View>

      <View style={styles.grid}>
        {CLUSTERS.map((cluster) => (
          <ClusterMarker
            key={cluster.id}
            label={cluster.label}
            emphasized={cluster.emphasized}
            onPress={() => router.push({ pathname: '/search/cluster', params: { id: cluster.id } })}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Text variant="body" color={colors.gray600}>
          {CLUSTERS.length} groupes disponibles · {Object.keys(DRIVERS).length} conducteurs
        </Text>
        <Button
          label="Prêt maintenant"
          size="lg"
          onPress={() => router.push({ pathname: '/search/cluster', params: { id: 'now' } })}
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
    justifyContent: 'space-between',
  },
  header: {
    gap: spacing.xs,
    marginBottom: spacing.xl,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: spacing.xl,
    flex: 1,
  },
  footer: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    gap: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.06,
    shadowRadius: 14,
    elevation: 2,
  },
  cta: {
    width: '100%',
  },
});
