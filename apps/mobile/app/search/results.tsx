import { View, StyleSheet, type DimensionValue } from 'react-native';
import { Text, Button, ClusterMarker, colors, spacing, radii } from '@vaya/design-system';
import { router } from 'expo-router';
import { CLUSTERS, DRIVERS } from '../../src/mocks/seed-data';

const totalPeople = CLUSTERS.reduce((sum, c) => sum + c.driverIds.length, 0) + 7;

// Loose, hand-placed positions (percent of the scatter field) — mirrors the
// reference's organic, non-grid arrangement rather than a regular grid.
const POSITIONS: Record<string, { top: DimensionValue; left: DimensionValue }> = {
  now: { top: '4%', left: '14%' },
  '+25a': { top: '2%', left: '62%' },
  '+10': { top: '38%', left: '38%' },
  '+15': { top: '52%', left: '8%' },
  '+25b': { top: '58%', left: '64%' },
};

export default function ResultsScreen(): React.JSX.Element {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text variant="h2" style={styles.headline}>
          {totalPeople} personnes se dirigent dans votre direction.
        </Text>
        <Text variant="body" color={colors.gray600}>
          {CLUSTERS.length} groupes disponibles.
        </Text>
      </View>

      <View style={styles.scatterField}>
        {CLUSTERS.map((cluster) => (
          <ClusterMarker
            key={cluster.id}
            label={cluster.label}
            emphasized={cluster.emphasized}
            onPress={() => router.push({ pathname: '/search/cluster', params: { id: cluster.id } })}
            style={[styles.scattered, POSITIONS[cluster.id]]}
          />
        ))}
      </View>

      <View style={styles.footer}>
        <Text variant="h3">{CLUSTERS.length} groupes disponibles.</Text>
        <Text variant="bodySmall" color={colors.gray600}>
          {Object.keys(DRIVERS).length} places disponibles.
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
  },
  header: {
    gap: 2,
    marginBottom: spacing.md,
  },
  headline: {
    fontWeight: '800',
    lineHeight: 30,
  },
  scatterField: {
    flex: 1,
    position: 'relative',
    minHeight: 300,
  },
  scattered: {
    position: 'absolute',
  },
  footer: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    borderBottomLeftRadius: radii.lg,
    borderBottomRightRadius: radii.lg,
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
