import { useEffect, useLayoutEffect, useMemo } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { skipToken } from '@reduxjs/toolkit/query/react';
import {
  Text,
  DriverMapPin,
  EmptyState,
  colors,
  spacing,
  radii,
  typography,
  regionForPoints,
} from '@vaya/design-system';
import { router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { clearPickupStop } from '../../src/state/searchSlice';
import { useMatchingSearchQuery, type MatchCandidate } from '../../src/state/api';
import { decodePolyline } from '../../src/utils/polyline';
import { trackEvent } from '../../src/services/analytics/analytics';

function toPinData(candidate: MatchCandidate): {
  id: string;
  name: string;
  priceLabel: string;
  etaLabel: string;
  statusLabel: string;
} {
  const firstName = (candidate.driverFullName ?? 'Conducteur').split(' ')[0]!;
  return {
    id: candidate.rideId,
    name: firstName,
    priceLabel: `${candidate.contributionPerSeat} DT`,
    etaLabel: `${Math.round(candidate.pickupWalkMinutes)} min à pied`,
    statusLabel: `${Math.round(candidate.routeOverlapPercent)}% trajet commun`,
  };
}

export default function ClusterScreen(): React.JSX.Element {
  const { label } = useLocalSearchParams<{ label: string }>();
  const navigation = useNavigation();
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const searchAt = useAppSelector((s) => s.search.searchAt);

  const searchArgs =
    origin && destination
      ? {
          originLat: origin.lat,
          originLng: origin.lng,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          when: searchAt ?? new Date().toISOString(),
        }
      : undefined;

  // Same args as results.tsx → served from RTK Query's cache, no extra fetch.
  const { data: allCandidates, isLoading } = useMatchingSearchQuery(searchArgs ?? skipToken);
  const clusterCandidates = useMemo(
    () => (allCandidates ?? []).filter((c) => c.clusterLabel === label),
    [allCandidates, label],
  );
  // Never present a ride the passenger can't actually book (product
  // principle #1/#4): a ride whose route_stops exist but none are
  // walkable for this passenger (`pickupViable: false`,
  // matching.service.ts) is silently non-selectable here rather than
  // shown as a dead end.
  const candidates = useMemo(
    () => clusterCandidates.filter((c) => c.pickupViable),
    [clusterCandidates],
  );

  useEffect(() => {
    for (const candidate of clusterCandidates) {
      if (!candidate.pickupViable) {
        trackEvent('pickup_no_viable_stop', { rideId: candidate.rideId });
      }
    }
  }, [clusterCandidates]);

  const recommended = useMemo(
    () => [...candidates].sort((a, b) => b.score - a.score)[0],
    [candidates],
  );

  const region = useMemo(() => {
    const points = candidates.map((c) => ({ lat: c.originLat, lng: c.originLng }));
    if (origin) points.push({ lat: origin.lat, lng: origin.lng });
    return regionForPoints(points);
  }, [candidates, origin]);

  const recommendedRoute = useMemo(
    () => (recommended?.routePolyline ? decodePolyline(recommended.routePolyline) : []),
    [recommended],
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: (label ?? '').toUpperCase() });
  }, [navigation, label]);

  function openDriver(candidate: MatchCandidate): void {
    // A fresh ride selection always starts with a clean pickup-stop slate
    // — otherwise a stop chosen for a previous ride could leak into this
    // one's booking.
    dispatch(clearPickupStop());
    const params = { rideId: candidate.rideId, driverUserId: candidate.driverUserId };
    if (candidate.rankedStops.length > 0) {
      // This ride has real, driver-selected route_stops — the passenger
      // must pick one (docs/domain/ride-engine.md), no free pin placement.
      router.push({ pathname: '/search/pickup-point', params });
    } else {
      // Legacy ride published before route_stops existed — free-form
      // pickup flow, unchanged, handled directly on trust.tsx.
      router.push({ pathname: '/search/trust', params });
    }
  }

  if (isLoading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator size="large" color={colors.secondary} />
      </View>
    );
  }

  if (!recommended) {
    return (
      <View style={styles.loadingWrap}>
        <EmptyState
          title={
            clusterCandidates.length > 0
              ? 'Aucun point de rendez-vous accessible pour ce groupe.'
              : "Ce groupe n'est plus disponible."
          }
          description={
            clusterCandidates.length > 0
              ? "Les trajets de ce groupe ne passent pas assez près de votre position."
              : undefined
          }
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.mapWrap}>
        {region ? (
          <MapView provider={PROVIDER_DEFAULT} style={styles.map} initialRegion={region}>
            {origin ? (
              <Marker
                coordinate={{ latitude: origin.lat, longitude: origin.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={styles.originDot} />
              </Marker>
            ) : null}
            {recommendedRoute.length > 1 ? (
              <Polyline
                coordinates={recommendedRoute}
                strokeColor={colors.mapRouteLine}
                strokeWidth={4}
              />
            ) : null}
            {candidates.map((candidate) => (
              <Marker
                key={candidate.rideId}
                coordinate={{ latitude: candidate.originLat, longitude: candidate.originLng }}
                onPress={() => openDriver(candidate)}
              >
                <DriverMapPin
                  data={toPinData(candidate)}
                  recommended={candidate.rideId === recommended.rideId}
                />
              </Marker>
            ))}
          </MapView>
        ) : null}
      </View>

      <Text variant="bodySmall" color={colors.gray600} style={styles.recommendCaption}>
        {(recommended.driverFullName ?? 'Ce conducteur').split(' ')[0]} est le mieux noté —{' '}
        {Math.round(recommended.pickupWalkMinutes)} min à pied.
      </Text>

      <TouchableOpacity
        style={styles.cta}
        onPress={() => openDriver(recommended)}
        activeOpacity={0.85}
      >
        <Text style={styles.ctaLabel}>
          Voir {(recommended.driverFullName ?? 'ce conducteur').split(' ')[0]} ·{' '}
          {recommended.contributionPerSeat} DT
        </Text>
        <Text style={styles.ctaSub}>
          {Math.round(recommended.pickupWalkMinutes)} min à pied jusqu&apos;au départ
        </Text>
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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  mapWrap: {
    flex: 1,
    minHeight: 340,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  originDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: colors.white,
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
