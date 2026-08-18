import { useLayoutEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import {
  Text,
  MapCanvas,
  MapRoute,
  DriverMapPin,
  colors,
  spacing,
  radii,
  typography,
  computeRouteGeometry,
  evenlySpacedPointsAlong,
  type Size,
} from '@vaya/design-system';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { CLUSTERS, DRIVERS, type MockDriver } from '../../src/mocks/seed-data';

// The route is defined once, as a fraction of the map container — everything
// else (pin positions, road angle/length, the arrow) is derived from it plus
// however many candidates the cluster actually has.
const ROUTE_START = { x: 0.16, y: 0.08 };
const ROUTE_END = { x: 0.74, y: 0.8 };

function toPinData(driver: MockDriver): {
  id: string;
  name: string;
  priceLabel?: string;
  etaLabel?: string;
  statusLabel?: string;
} {
  return {
    id: driver.id,
    name: driver.fullName.split(' ')[0]!,
    priceLabel: driver.priceDt !== undefined ? `${driver.priceDt} DT` : undefined,
    etaLabel: driver.etaMin !== undefined ? `${driver.etaMin} min` : undefined,
    statusLabel: driver.status,
  };
}

export default function ClusterScreen(): React.JSX.Element {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const cluster = CLUSTERS.find((c) => c.id === id) ?? CLUSTERS[0]!;
  const candidates = useMemo(() => cluster.driverIds.map((key) => DRIVERS[key]!), [cluster]);

  // The bottom CTA is a shortcut to ONE specific driver, not a mystery
  // action — soonest ETA wins, ties broken by rating. Always named.
  const recommended = useMemo(
    () =>
      [...candidates].sort(
        (a, b) => (a.etaMin ?? 0) - (b.etaMin ?? 0) || b.ratingAvg - a.ratingAvg,
      )[0]!,
    [candidates],
  );
  const recommendedKey = cluster.driverIds[candidates.indexOf(recommended)]!;

  const [mapSize, setMapSize] = useState<Size>({ width: 0, height: 0 });
  const geometry = useMemo(() => computeRouteGeometry(mapSize, ROUTE_START, ROUTE_END), [mapSize]);
  const points = useMemo(
    () => (geometry ? evenlySpacedPointsAlong(geometry, candidates.length) : []),
    [geometry, candidates.length],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: cluster.label.toUpperCase() });
  }, [navigation, cluster.label]);

  function openDriver(driverKey: string): void {
    router.push({ pathname: '/search/trust', params: { driverId: driverKey } });
  }

  return (
    <View style={styles.container}>
      <MapCanvas onSizeChange={setMapSize} style={styles.map}>
        {geometry ? (
          <>
            <MapRoute geometry={geometry} />
            {candidates.map((driver, i) => {
              const driverKey = cluster.driverIds[i]!;
              const point = points[i]!;
              const avatarHalf = 18; // half of DriverMapPin's base avatar size
              return (
                <DriverMapPin
                  key={driver.id}
                  data={toPinData(driver)}
                  recommended={driverKey === recommendedKey}
                  labelSide={i % 2 === 1 ? 'start' : 'end'}
                  onPress={() => openDriver(driverKey)}
                  style={{
                    position: 'absolute',
                    left: point.x - 4,
                    top: point.y - avatarHalf - 4,
                  }}
                />
              );
            })}
          </>
        ) : null}
      </MapCanvas>

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
    minHeight: 340,
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
