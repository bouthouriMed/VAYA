import { useMemo } from 'react';
import { View, StyleSheet, ActivityIndicator, type DimensionValue } from 'react-native';
import { skipToken } from '@reduxjs/toolkit/query/react';
import {
  Text,
  Button,
  ClusterMarker,
  EmptyState,
  SkeletonCircle,
  useToast,
  colors,
  spacing,
  radii,
  formatDepartureLabel,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppSelector } from '../../src/state/store';
import {
  useMatchingSearchQuery,
  useCorridorFallbackQuery,
  useNotifyMeMutation,
  type MatchCandidate,
} from '../../src/state/api';

// Loose, hand-placed positions (percent of the scatter field) — mirrors the
// reference's organic, non-grid arrangement. Cycled by index since cluster
// count/labels are now dynamic (server-driven), not a fixed known set.
const POSITION_POOL: { top: DimensionValue; left: DimensionValue }[] = [
  { top: '4%', left: '14%' },
  { top: '2%', left: '62%' },
  { top: '38%', left: '38%' },
  { top: '52%', left: '8%' },
  { top: '58%', left: '64%' },
  { top: '20%', left: '4%' },
  { top: '10%', left: '82%' },
  { top: '68%', left: '30%' },
];

interface ClusterGroup {
  label: string;
  candidates: MatchCandidate[];
  emphasized: boolean;
}

function groupByCluster(candidates: MatchCandidate[]): ClusterGroup[] {
  const byLabel = new Map<string, MatchCandidate[]>();
  for (const candidate of candidates) {
    const list = byLabel.get(candidate.clusterLabel) ?? [];
    list.push(candidate);
    byLabel.set(candidate.clusterLabel, list);
  }
  return Array.from(byLabel.entries())
    .map(([label, list]) => ({
      label,
      candidates: list.sort((a, b) => b.score - a.score),
      emphasized: label === 'Maintenant',
    }))
    .sort(
      (a, b) =>
        new Date(a.candidates[0]!.departureAt).getTime() -
        new Date(b.candidates[0]!.departureAt).getTime(),
    );
}

export default function ResultsScreen(): React.JSX.Element {
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

  const { data: candidates, isLoading } = useMatchingSearchQuery(searchArgs ?? skipToken);
  const noExactMatches = !isLoading && (candidates?.length ?? 0) === 0;
  const { data: fallback, isFetching: isFallbackLoading } = useCorridorFallbackQuery(
    !searchArgs || !noExactMatches ? skipToken : searchArgs,
  );
  const [notifyMe, { isLoading: isNotifying, isSuccess: notified }] = useNotifyMeMutation();
  const showToast = useToast();

  const groups = useMemo(() => groupByCluster(candidates ?? []), [candidates]);
  const fallbackGroups = useMemo(() => groupByCluster(fallback?.nearbyRides ?? []), [fallback]);
  const totalPeople = (candidates?.length ?? 0) + (fallback?.nearbyRides.length ?? 0);
  const emphasizedGroup = groups.find((g) => g.emphasized) ?? groups[0];

  function openCluster(label: string): void {
    router.push({ pathname: '/search/cluster', params: { label } });
  }

  async function handleNotifyMe(): Promise<void> {
    if (!origin || !destination) return;
    // Centered on the time the rider actually searched for (which may be a
    // future date/time chosen on explore.tsx), not always "right now" — a
    // notify-me signal for a search set to "Demain matin" should watch that
    // window, not the next 3 hours from whenever the button happened to be
    // tapped.
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

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {origin && destination ? (
          <Text variant="bodySmall" color={colors.gray500} numberOfLines={1}>
            {origin.label} → {destination.label}
            {searchAt ? ` · ${formatDepartureLabel(new Date(searchAt))}` : ''}
          </Text>
        ) : null}
        <Text variant="h2" style={styles.headline}>
          {isLoading
            ? 'Recherche en cours…'
            : totalPeople > 0
              ? `${totalPeople} personnes se dirigent dans votre direction.`
              : "Aucun trajet pour l'instant."}
        </Text>
        {!isLoading ? (
          <Text variant="body" color={colors.gray600}>
            {groups.length > 0
              ? `${groups.length} groupes disponibles.`
              : 'Essayez un autre horaire.'}
          </Text>
        ) : null}
      </View>

      {isLoading ? (
        <View style={styles.scatterField}>
          {POSITION_POOL.map((position, i) => (
            <SkeletonCircle key={i} size={i === 0 ? 64 : 46} style={[styles.scattered, position]} />
          ))}
        </View>
      ) : groups.length > 0 ? (
        <View style={styles.scatterField}>
          {groups.map((group, i) => (
            <ClusterMarker
              key={group.label}
              label={group.label}
              emphasized={group.emphasized}
              onPress={() => openCluster(group.label)}
              style={[styles.scattered, POSITION_POOL[i % POSITION_POOL.length]]}
            />
          ))}
        </View>
      ) : (
        <EmptyState
          title={
            fallbackGroups.length > 0
              ? `Rien d'exact, mais ${fallback?.nearbyRides.length} trajet(s) à proximité :`
              : 'Personne sur ce trajet pour le moment.'
          }
          actionLabel={notified ? 'Nous vous préviendrons ✓' : 'Me notifier si un trajet apparaît'}
          actionDisabled={isNotifying || notified}
          onAction={() => void handleNotifyMe()}
        >
          {isFallbackLoading ? (
            <ActivityIndicator size="large" color={colors.secondary} />
          ) : fallbackGroups.length > 0 ? (
            <View style={styles.scatterField}>
              {fallbackGroups.map((group, i) => (
                <ClusterMarker
                  key={group.label}
                  label={group.label}
                  onPress={() => openCluster(group.label)}
                  style={[styles.scattered, POSITION_POOL[i % POSITION_POOL.length]]}
                />
              ))}
            </View>
          ) : null}
        </EmptyState>
      )}

      {groups.length > 0 ? (
        <View style={styles.footer}>
          <Text variant="h3">{groups.length} groupes disponibles.</Text>
          <Text variant="bodySmall" color={colors.gray600}>
            {candidates?.length ?? 0} places disponibles.
          </Text>
          <Button
            label="Prêt maintenant"
            size="lg"
            onPress={() => emphasizedGroup && openCluster(emphasizedGroup.label)}
            style={styles.cta}
          />
        </View>
      ) : null}
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
