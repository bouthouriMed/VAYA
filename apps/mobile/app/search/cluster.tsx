import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { Text, Avatar, colors, spacing, radii, typography } from '@vaya/design-system';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useLayoutEffect } from 'react';
import { CLUSTERS, DRIVERS } from '../../src/mocks/seed-data';

const STATUSES = ['Se dirige vers vous', 'En mouvement', 'Vient de partir'];

// Hand-placed along the route corridor, cascading top-left to bottom-right.
const PILL_POSITIONS = [
  { top: '8%', left: '6%' },
  { top: '34%', left: '26%' },
  { top: '58%', left: '40%' },
] as const;

export default function ClusterScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const cluster = CLUSTERS.find((c) => c.id === id) ?? CLUSTERS[0]!;
  const candidates = cluster.driverIds.map((key) => DRIVERS[key]!);

  useLayoutEffect(() => {
    navigation.setOptions({ title: cluster.label.toUpperCase() });
  }, [navigation, cluster.label]);

  return (
    <View style={styles.container}>
      <View style={styles.map}>
        <View style={styles.routeCorridor} />
        <View style={styles.arrowMarker} />

        {candidates.map((driver, i) => (
          <TouchableOpacity
            key={driver.id}
            style={[styles.pill, PILL_POSITIONS[i % PILL_POSITIONS.length]]}
            onPress={() => router.push('/search/trust')}
            activeOpacity={0.85}
          >
            <Avatar name={driver.fullName} size="sm" />
            <View>
              <Text style={styles.pillName}>{driver.fullName.split(' ')[0]}</Text>
              <Text style={styles.pillStatus}>{STATUSES[i % STATUSES.length]}</Text>
            </View>
          </TouchableOpacity>
        ))}
      </View>

      <TouchableOpacity style={styles.infoRow} activeOpacity={0.7}>
        <View>
          <Text variant="label">{cluster.label}</Text>
          <Text variant="bodySmall" color={colors.gray600}>
            11 min d&apos;attente
          </Text>
        </View>
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>

      <TouchableOpacity
        style={styles.cta}
        onPress={() => router.push('/search/trust')}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaLabel}>{cluster.label}</Text>
        <Text style={styles.ctaSub}>11 min d&apos;attente</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    padding: spacing.lg,
    gap: spacing.md,
  },
  map: {
    flex: 1,
    backgroundColor: colors.mapTileTint,
    borderRadius: radii.xl,
    position: 'relative',
    overflow: 'hidden',
    minHeight: 340,
  },
  routeCorridor: {
    position: 'absolute',
    top: '10%',
    left: '10%',
    width: '55%',
    height: '65%',
    borderRadius: 40,
    backgroundColor: colors.secondaryLight + '55',
    transform: [{ rotate: '32deg' }],
  },
  arrowMarker: {
    position: 'absolute',
    bottom: '18%',
    right: '22%',
    width: 0,
    height: 0,
    borderLeftWidth: 8,
    borderRightWidth: 8,
    borderTopWidth: 12,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderTopColor: colors.primary,
    transform: [{ rotate: '135deg' }],
  },
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingVertical: 6,
    paddingHorizontal: spacing.sm,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  pillName: {
    fontSize: typography.fontSize.xs,
    fontWeight: typography.fontWeight.bold,
    color: colors.gray900,
  },
  pillStatus: {
    fontSize: 10,
    color: colors.gray600,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 1,
  },
  chevron: {
    fontSize: 22,
    color: colors.gray500,
  },
  cta: {
    backgroundColor: colors.primary,
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaLabel: {
    color: colors.white,
    fontWeight: typography.fontWeight.bold,
    fontSize: typography.fontSize.md,
  },
  ctaSub: {
    color: colors.navyTextMuted,
    fontSize: typography.fontSize.xs,
    marginTop: 2,
  },
});
