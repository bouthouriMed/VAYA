import { useMemo, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { skipToken } from '@reduxjs/toolkit/query/react';
import {
  Text,
  Icon,
  DriverListCard,
  DriverMapPin,
  EmptyState,
  SkeletonBlock,
  useToast,
  useAppTheme,
  spacing,
  radii,
  formatDepartureLabel,
  regionForPoints,
  type AppPalette,
  type DriverListCardData,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import {
  useMatchingSearchQuery,
  useNotifyMeMutation,
  useListFellowPassengersQuery,
  useGetRideStopsQuery,
  type MatchCandidate,
} from '../../src/state/api';
import { useOpenDriver } from '../../src/features/search/useOpenDriver';
import { estimateWalkMinutes } from '../../src/utils/polyline';

function toPinData(candidate: MatchCandidate): {
  id: string;
  name: string;
  priceLabel: string;
  etaLabel: string;
} {
  return {
    id: candidate.rideId,
    name: (candidate.driverFullName ?? 'Conducteur').split(' ')[0]!,
    priceLabel: `${candidate.contributionPerSeat} DT`,
    etaLabel: `${Math.round(candidate.pickupWalkMinutes)} min à pied`,
  };
}

/** Splits a geocoded label like "Nabeul Centre, Nabeul, Tunisie" into a
 *  broad first segment (for the card's bold "city" line) and the fuller
 *  original label (for the specific "place" line below it) — real search
 *  text, not invented. */
function splitLocationLabel(label: string): { city: string; place?: string } {
  const [first, ...rest] = label.split(',').map((s) => s.trim());
  const remainder = rest.join(', ');
  return { city: first || label, place: remainder || (first !== label ? label : undefined) };
}

/** Fetches this one candidate's real fellow-passengers + route stops (both
 *  already-existing endpoints, RTK-Query-cached per rideId) so the card can
 *  show real overlapping avatars and a real dropoff-walk estimate instead
 *  of inventing either. */
function RideResultCard({
  candidate,
  bestMatch,
  origin,
  destination,
  searchAt,
  theme,
  onPress,
}: {
  candidate: MatchCandidate;
  bestMatch: boolean;
  origin: { label: string } | null;
  destination: { label: string; lat: number; lng: number } | null;
  searchAt: string | null;
  theme: AppPalette;
  onPress: () => void;
}): React.JSX.Element {
  const { data: passengers } = useListFellowPassengersQuery(candidate.rideId);
  const { data: stops } = useGetRideStopsQuery(candidate.rideId);

  const time = new Date(candidate.departureAt).toLocaleTimeString('fr-FR', {
    hour: '2-digit',
    minute: '2-digit',
  });
  const closestStop = candidate.rankedStops[0];
  let timeOffsetNote: string | undefined;
  if (searchAt) {
    const offsetMin = Math.round(
      (new Date(candidate.departureAt).getTime() - new Date(searchAt).getTime()) / 60_000,
    );
    if (offsetMin > 2) {
      timeOffsetNote = `Part ${offsetMin} min après l'heure demandée, vous prend à ${Math.round(
        candidate.pickupWalkMinutes,
      )} min à pied.`;
    }
  }

  const dropoffSplit = destination ? splitLocationLabel(destination.label) : { city: 'Destination' };
  // Real geometry, not fabricated: the driver's furthest real route_stop
  // past the pickup, distance to the actual destination coordinates.
  const lastStop = stops && stops.length > 0 ? stops[stops.length - 1] : undefined;
  const dropoffWalkMinutes =
    lastStop && destination
      ? estimateWalkMinutes(
          { latitude: lastStop.lat, longitude: lastStop.lng },
          { latitude: destination.lat, longitude: destination.lng },
        )
      : undefined;

  const data: DriverListCardData = {
    driverName: candidate.driverFullName ?? 'Conducteur',
    ratingAvg: candidate.ratingAvg,
    timeLabel: time,
    priceLabel: `${candidate.contributionPerSeat} DT`,
    pickupCityLabel: origin?.label ? splitLocationLabel(origin.label).city : 'Départ',
    pickupPlaceLabel: closestStop?.label ?? 'Point de rendez-vous',
    pickupWalkLabel: `${Math.round(candidate.pickupWalkMinutes)} min`,
    dropoffCityLabel: dropoffSplit.city,
    dropoffPlaceLabel: dropoffSplit.place,
    dropoffWalkLabel:
      dropoffWalkMinutes !== undefined ? `${Math.max(1, Math.round(dropoffWalkMinutes))} min à pied` : undefined,
    seatsAvailable: candidate.seatsAvailable,
    timeOffsetNote,
    passengers: passengers?.map((p) => ({ userId: p.userId, name: p.firstName, avatarUrl: p.avatarUrl })),
    routeBadgeLabel: candidate.matchType === 'route_passthrough' ? 'Sur votre trajet' : undefined,
  };

  return <DriverListCard theme={theme} bestMatch={bestMatch} data={data} onPress={onPress} />;
}

export default function ResultsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const searchAt = useAppSelector((s) => s.search.searchAt);
  const openDriver = useOpenDriver();

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

  // Phase 13 (docs/roadmap/phase-13-search-engine.md): one query, one
  // server-side tiered cascade — replaces the old two-endpoint (matching/
  // search + matching/corridor-fallback) client-orchestrated pair and its
  // local "did the time drift?" banner heuristic with the server's own
  // tier + ready-to-render `message`.
  const { data: searchResult, isLoading } = useMatchingSearchQuery(searchArgs ?? skipToken);
  const tier = searchResult?.tier;
  const [notifyMe, { isLoading: isNotifying, isSuccess: notified }] = useNotifyMeMutation();
  const showToast = useToast();
  const [showMap, setShowMap] = useState(false);

  // Depends on `searchResult` itself (a stable RTK Query reference per
  // cache entry), not `searchResult?.candidates ?? []` — the latter builds
  // a fresh array on every render even when nothing changed, which would
  // otherwise invalidate both memos below on every unrelated re-render.
  const sorted = useMemo(
    () =>
      [...(searchResult?.candidates ?? [])].sort(
        (a, b) => new Date(a.departureAt).getTime() - new Date(b.departureAt).getTime(),
      ),
    [searchResult],
  );
  const bestMatchId = useMemo(
    () => [...(searchResult?.candidates ?? [])].sort((a, b) => b.score - a.score)[0]?.rideId,
    [searchResult],
  );

  async function handleNotifyMe(): Promise<void> {
    if (!origin || !destination) return;
    const target = new Date(searchAt ?? Date.now());
    try {
      await notifyMe({
        origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
        destination: { label: destination.label, lat: destination.lat, lng: destination.lng },
        desiredWindowStart: new Date(target.getTime() - 1.5 * 3_600_000),
        desiredWindowEnd: new Date(target.getTime() + 1.5 * 3_600_000),
      }).unwrap();
      showToast({ message: 'Nous vous préviendrons dès qu’un trajet apparaît.', tone: 'success' });
    } catch {
      showToast({ message: 'Impossible de vous inscrire pour le moment.', tone: 'error' });
    }
  }

  const mapRegion = useMemo(() => {
    const points = sorted.map((c) => ({ lat: c.originLat, lng: c.originLng }));
    if (origin) points.push({ lat: origin.lat, lng: origin.lng });
    return regionForPoints(points);
  }, [sorted, origin]);

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          {
            paddingTop: insets.top + spacing.sm,
            backgroundColor: theme.surface,
            borderBottomColor: theme.outlineVariant,
          },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={styles.headerSide}
          accessibilityRole="button"
          accessibilityLabel="Retour"
        >
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text
          variant="h3"
          color={theme.ink}
          numberOfLines={1}
          align="center"
          style={styles.headerTitle}
        >
          {origin && destination ? `${origin.label} → ${destination.label}` : 'Résultats'}
        </Text>
        <View style={styles.headerSide} />
      </View>

      <View
        style={[
          styles.subheader,
          { backgroundColor: theme.surface, borderBottomColor: theme.outlineVariant },
        ]}
      >
        <View style={styles.subheaderDateRow}>
          <Icon name="calendar-outline" size="xs" color={theme.inkFaint} />
          <Text variant="bodySmall" color={theme.inkFaint} style={styles.subheaderDateText}>
            {searchAt ? formatDepartureLabel(new Date(searchAt)) : "Aujourd'hui, maintenant"}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => setShowMap((v) => !v)}
          style={[styles.mapToggle, { backgroundColor: theme.surfaceMuted }]}
          accessibilityRole="button"
          accessibilityLabel={showMap ? 'Voir la liste' : 'Voir sur la carte'}
        >
          <Icon name={showMap ? 'list-outline' : 'map-outline'} size="xs" color={theme.ink} />
          <Text variant="caption" color={theme.ink} style={styles.mapToggleText}>
            {showMap ? 'Liste' : 'Carte'}
          </Text>
        </TouchableOpacity>
      </View>

      {showMap ? (
        <View style={styles.mapWrap}>
          {mapRegion && !isLoading ? (
            <MapView provider={PROVIDER_DEFAULT} style={styles.map} initialRegion={mapRegion} customMapStyle={[]}>
              {origin ? (
                <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.5 }}>
                  <View style={[styles.originDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
                </Marker>
              ) : null}
              {sorted.map((candidate) => (
                <Marker
                  key={candidate.rideId}
                  coordinate={{ latitude: candidate.originLat, longitude: candidate.originLng }}
                  onPress={() => openDriver(candidate)}
                  zIndex={candidate.rideId === bestMatchId ? 10 : 1}
                >
                  <DriverMapPin data={toPinData(candidate)} recommended={candidate.rideId === bestMatchId} />
                </Marker>
              ))}
            </MapView>
          ) : (
            <View style={styles.mapLoading}>
              <ActivityIndicator size="large" color={theme.accent} />
            </View>
          )}
        </View>
      ) : (
      <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
        {isLoading ? (
          <View style={styles.skeletonWrap}>
            <SkeletonBlock height={140} style={styles.skeletonCard} />
            <SkeletonBlock height={140} style={styles.skeletonCard} />
            <SkeletonBlock height={140} style={styles.skeletonCard} />
          </View>
        ) : sorted.length > 0 ? (
          <>
            {searchResult?.message ? (
              <View
                style={[
                  styles.banner,
                  { backgroundColor: theme.background, borderColor: theme.outlineVariant },
                ]}
              >
                <Icon
                  name={tier === 'route_passthrough' ? 'git-network-outline' : 'information-circle-outline'}
                  size="sm"
                  color={theme.inkFaint}
                />
                <Text variant="bodySmall" color={theme.inkMuted} style={styles.bannerText}>
                  {searchResult.message}
                </Text>
              </View>
            ) : null}

            <View style={styles.cardsCol}>
              {sorted.map((candidate) => (
                <RideResultCard
                  key={candidate.rideId}
                  theme={theme}
                  bestMatch={candidate.rideId === bestMatchId}
                  candidate={candidate}
                  origin={origin}
                  destination={destination}
                  searchAt={searchAt}
                  onPress={() => openDriver(candidate)}
                />
              ))}
            </View>

            {tier && tier !== 'exact' ? (
              <TouchableOpacity
                style={[
                  styles.notifyButton,
                  {
                    borderColor: theme.outline,
                    opacity: isNotifying || notified ? 0.6 : 1,
                  },
                ]}
                onPress={() => void handleNotifyMe()}
                disabled={isNotifying || notified}
                accessibilityRole="button"
                accessibilityLabel={
                  notified ? 'Nous vous préviendrons' : 'Me notifier si un trajet apparaît'
                }
              >
                <Text variant="label" color={theme.ink} align="center">
                  {notified ? 'Nous vous préviendrons ✓' : "Me notifier si un trajet apparaît à l'heure exacte"}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyState
              title="Personne sur ce trajet pour le moment."
              actionLabel={
                notified ? 'Nous vous préviendrons ✓' : 'Me notifier si un trajet apparaît'
              }
              actionDisabled={isNotifying || notified}
              onAction={() => void handleNotifyMe()}
            />
          </View>
        )}
      </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  headerTitle: {
    flex: 1,
  },
  headerSide: {
    width: 22,
    alignItems: 'center',
  },
  mapToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  mapToggleText: {
    lineHeight: 16,
  },
  mapWrap: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  mapLoading: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  originDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  subheader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing['4xl'],
    paddingVertical: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  subheaderDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  subheaderDateText: {
    lineHeight: 16,
  },
  listContent: {
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    gap: spacing.lg,
  },
  skeletonWrap: {
    gap: spacing.md,
  },
  skeletonCard: {
    borderRadius: radii.xl,
  },
  banner: {
    flexDirection: 'row',
    gap: spacing.sm,
    borderRadius: radii.md,
    borderWidth: 1,
    padding: spacing.md,
    marginBottom: spacing.md,
  },
  bannerText: {
    flex: 1,
  },
  cardsCol: {
    gap: spacing.md,
  },
  notifyButton: {
    marginTop: spacing.lg,
    borderRadius: radii.full,
    borderWidth: 1,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  emptyWrap: {
    paddingTop: spacing['3xl'],
  },
});
