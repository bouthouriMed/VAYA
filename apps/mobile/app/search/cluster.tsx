import { useLayoutEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import { Text, Avatar, colors, spacing, radii, typography } from '@vaya/design-system';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { CLUSTERS, DRIVERS, type MockDriver } from '../../src/mocks/seed-data';

// The route is defined once, as a fraction of the map container — everything
// else (pill positions, road angle/length, the arrow) is derived from it plus
// however many candidates the cluster actually has, so it stays correct for
// any N once this is wired to the real matching API's route geometry.
const ROUTE_START = { x: 0.16, y: 0.08 };
const ROUTE_END = { x: 0.74, y: 0.8 };
const ROAD_WIDTH = 34;
const AVATAR_SIZE = 36;

interface Size {
  width: number;
  height: number;
}

interface PillLayout {
  driver: MockDriver;
  anchorX: number;
  anchorY: number;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function useRouteGeometry(size: Size, candidates: MockDriver[]) {
  return useMemo(() => {
    if (size.width === 0 || size.height === 0) return null;

    const startPx = { x: ROUTE_START.x * size.width, y: ROUTE_START.y * size.height };
    const endPx = { x: ROUTE_END.x * size.width, y: ROUTE_END.y * size.height };
    const dx = endPx.x - startPx.x;
    const dy = endPx.y - startPx.y;
    const roadLength = Math.hypot(dx, dy);
    const roadAngleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;

    // Evenly space candidates along the route, leaving headroom at both ends
    // for the origin dot and the destination arrow.
    const pills: PillLayout[] = candidates.map((driver, i) => {
      const t = (i + 1) / (candidates.length + 1);
      return { driver, anchorX: lerp(startPx.x, endPx.x, t), anchorY: lerp(startPx.y, endPx.y, t) };
    });

    return { startPx, endPx, roadLength, roadAngleDeg, pills };
  }, [size.width, size.height, candidates]);
}

export default function ClusterScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const cluster = CLUSTERS.find((c) => c.id === id) ?? CLUSTERS[0]!;
  const candidates = useMemo(() => cluster.driverIds.map((key) => DRIVERS[key]!), [cluster]);

  // The bottom CTA is a shortcut to ONE specific driver, not a mystery
  // action — soonest ETA wins, ties broken by rating. Always named.
  const recommended = useMemo(
    () => [...candidates].sort((a, b) => a.etaMin - b.etaMin || b.ratingAvg - a.ratingAvg)[0]!,
    [candidates],
  );

  const [mapSize, setMapSize] = useState<Size>({ width: 0, height: 0 });
  const geometry = useRouteGeometry(mapSize, candidates);

  useLayoutEffect(() => {
    navigation.setOptions({ title: cluster.label.toUpperCase() });
  }, [navigation, cluster.label]);

  function onMapLayout(e: LayoutChangeEvent): void {
    const { width, height } = e.nativeEvent.layout;
    setMapSize({ width, height });
  }

  function openDriver(driverKey: string): void {
    router.push({ pathname: '/search/trust', params: { driverId: driverKey } });
  }

  const recommendedKey = Object.keys(DRIVERS).find((k) => DRIVERS[k] === recommended)!;

  return (
    <View style={styles.container}>
      <View style={styles.map} onLayout={onMapLayout}>
        <View style={styles.streetGrid} pointerEvents="none">
          {[0.2, 0.42, 0.65, 0.85].map((f) => (
            <View key={`h${f}`} style={[styles.streetLine, { top: `${f * 100}%` }]} />
          ))}
          {[0.25, 0.5, 0.78].map((f) => (
            <View
              key={`v${f}`}
              style={[styles.streetLine, styles.streetLineVertical, { left: `${f * 100}%` }]}
            />
          ))}
        </View>

        {geometry ? (
          <>
            <View
              style={[
                styles.road,
                {
                  width: geometry.roadLength,
                  left: geometry.startPx.x,
                  top: geometry.startPx.y - ROAD_WIDTH / 2,
                  transform: [{ rotate: `${geometry.roadAngleDeg}deg` }],
                  transformOrigin: 'left center',
                },
              ]}
            />
            <View
              style={[
                styles.arrow,
                {
                  left: geometry.endPx.x - 8,
                  top: geometry.endPx.y - 6,
                  transform: [{ rotate: `${geometry.roadAngleDeg + 90}deg` }],
                },
              ]}
            />
            {geometry.pills.map(({ driver, anchorX, anchorY }, i) => {
              const driverKey = cluster.driverIds[i]!;
              const isRecommended = driverKey === recommendedKey;
              return (
                <TouchableOpacity
                  key={driver.id}
                  style={[
                    styles.pill,
                    isRecommended && styles.pillRecommended,
                    { left: anchorX - 4, top: anchorY - AVATAR_SIZE / 2 - 4 },
                    i % 2 === 1 && styles.pillOffsetRight,
                  ]}
                  onPress={() => openDriver(driverKey)}
                  activeOpacity={0.85}
                >
                  <Avatar name={driver.fullName} size="sm" />
                  <View>
                    <Text style={styles.pillName}>
                      {driver.fullName.split(' ')[0]} · {driver.priceDt} DT
                    </Text>
                    <Text style={styles.pillStatus}>
                      {driver.status} · {driver.etaMin} min
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </>
        ) : null}
      </View>

      <Text variant="bodySmall" color={colors.gray600} style={styles.recommendCaption}>
        {recommended.fullName.split(' ')[0]} est le plus proche — {recommended.etaMin} min
        d&apos;attente.
      </Text>

      <TouchableOpacity
        style={styles.cta}
        onPress={() => openDriver(recommendedKey)}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaLabel}>
          Voir {recommended.fullName.split(' ')[0]} · {recommended.priceDt} DT
        </Text>
        <Text style={styles.ctaSub}>{recommended.etaMin} min d&apos;attente</Text>
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
  streetGrid: {
    ...StyleSheet.absoluteFillObject,
  },
  streetLine: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 1,
    backgroundColor: colors.gray300,
    opacity: 0.6,
  },
  streetLineVertical: {
    top: 0,
    bottom: 0,
    left: 0,
    right: undefined,
    width: 1,
    height: undefined,
  },
  road: {
    position: 'absolute',
    height: ROAD_WIDTH,
    borderRadius: ROAD_WIDTH / 2,
    backgroundColor: colors.secondary + 'A0',
  },
  arrow: {
    position: 'absolute',
    width: 0,
    height: 0,
    borderLeftWidth: 7,
    borderRightWidth: 7,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    borderBottomColor: colors.primary,
  },
  pill: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingVertical: 4,
    paddingHorizontal: spacing.sm,
    paddingRight: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 3,
  },
  pillRecommended: {
    borderWidth: 1.5,
    borderColor: colors.secondary,
  },
  pillOffsetRight: {
    flexDirection: 'row-reverse',
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
  recommendCaption: {
    textAlign: 'center',
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
