import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity, ScrollView } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import {
  Text,
  Icon,
  DriverListCard,
  DriverMapPin,
  PickupPin,
  EmptyState,
  SkeletonBlock,
  useToast,
  useAppTheme,
  spacing,
  radii,
  isSameDay,
  regionForPoints,
  haptics,
  type AppPalette,
  type DriverListCardData,
} from '@vaya/design-system';
import { router } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import { useAppSelector } from '../../src/state/store';
import { formatTime, formatDateTime } from '../../src/utils/localeFormat';
import {
  useMatchingSearchQuery,
  useNotifyMeMutation,
  useListFellowPassengersQuery,
  type MatchCandidate,
} from '../../src/state/api';
import { useOpenDriver } from '../../src/features/search/useOpenDriver';
import { trackEvent } from '../../src/services/analytics/analytics';

type TFn = (key: string, params?: Record<string, unknown>) => string;

/** A localized "{{minutes}} à pied"-style walk label — reused for the map
 *  pin's ETA and the dropoff walk chip (search:walk.suffix), each built
 *  from the shared `common:terms.minute` pluralization rather than a
 *  hand-rolled "X min" string. */
function walkSuffixLabel(t: TFn, minutes: number): string {
  return t('search:walk.suffix', { minutes: t('common:terms.minute', { count: Math.round(minutes) }) });
}

/** "Aujourd'hui, 14:30" / "Demain, 09:00" / "21 août, 18:15"-style label for
 *  the searched date/time, built locally from `common:time.today`/
 *  `tomorrow` + the locale-aware `formatTime`/`formatDateTime` rather than
 *  design-system's `formatDepartureLabel` (scheduling.ts), which is not yet
 *  locale-parameterized in this codebase — stays translation-agnostic for
 *  every supported locale without depending on that shared util's signature. */
function departureBadgeLabel(date: Date, locale: SupportedLocale, t: TFn): string {
  const now = new Date();
  if (isSameDay(date, now)) return `${t('common:time.today')}, ${formatTime(date, locale)}`;
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60_000);
  if (isSameDay(date, tomorrow)) return `${t('common:time.tomorrow')}, ${formatTime(date, locale)}`;
  return formatDateTime(date, locale);
}

function toPinData(
  candidate: MatchCandidate,
  t: TFn,
): {
  id: string;
  name: string;
  priceLabel: string;
  etaLabel: string;
} {
  return {
    id: candidate.rideId,
    name: (candidate.driverFullName ?? t('search:results.driverFallback')).split(' ')[0]!,
    priceLabel: `${candidate.contributionPerSeat} DT`,
    etaLabel: walkSuffixLabel(t, candidate.pickupWalkMinutes),
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

/** Fetches this one candidate's real fellow-passengers (an already-existing
 *  endpoint, RTK-Query-cached per rideId) so the card can show real
 *  overlapping avatars instead of inventing them. */
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
  const { t, i18n } = useTranslation(['search', 'common', 'booking']);
  const locale = i18n.language as SupportedLocale;

  // The real time THIS passenger would be picked up, not the ride's own
  // departure time re-shown as if it were theirs — a real bug found live:
  // a rider matched mid-route (route_passthrough/detour) saw the driver's
  // origin departure time labeled as their own pickup time. pickupEtaSeconds
  // is 0 for an 'endpoint' match (pickup ≈ the ride's own origin), so this
  // collapses to the exact previous behavior for every match type except
  // the two where it was actually wrong.
  const pickupTime = new Date(new Date(candidate.departureAt).getTime() + candidate.pickupEtaSeconds * 1000);
  const time = formatTime(pickupTime, locale);
  const closestStop = candidate.rankedStops[0];
  let timeOffsetNote: string | undefined;
  if (searchAt) {
    const offsetMin = Math.round((pickupTime.getTime() - new Date(searchAt).getTime()) / 60_000);
    if (offsetMin > 2) {
      timeOffsetNote = t('search:results.timeOffsetNote', {
        offsetMin: t('common:terms.minute', { count: offsetMin }),
        walkMinutes: t('common:terms.minute', { count: Math.round(candidate.pickupWalkMinutes) }),
      });
    }
  }

  const dropoffSplit = destination ? splitLocationLabel(destination.label) : { city: t('search:results.destination') };

  const data: DriverListCardData = {
    driverName: candidate.driverFullName ?? t('search:results.driverFallback'),
    driverAvatarUrl: candidate.driverAvatarUrl,
    ratingAvg: candidate.ratingAvg,
    timeLabel: time,
    priceLabel: `${candidate.contributionPerSeat} DT`,
    pickupCityLabel: origin?.label ? splitLocationLabel(origin.label).city : t('search:results.departure'),
    pickupPlaceLabel: closestStop?.label ?? t('search:results.meetingPoint'),
    pickupWalkLabel: t('common:terms.minute', { count: Math.round(candidate.pickupWalkMinutes) }),
    dropoffCityLabel: dropoffSplit.city,
    dropoffPlaceLabel: dropoffSplit.place,
    dropoffWalkLabel: walkSuffixLabel(t, Math.max(1, candidate.dropoffWalkMinutes)),
    seatsAvailable: candidate.seatsAvailable,
    seatsLabel: t('common:terms.seat', { count: candidate.seatsAvailable }),
    bestMatchLabel: t('search:results.bestMatch'),
    accessibilityLabel: `${candidate.driverFullName ?? t('search:results.driverFallback')}, ${t('common:terms.departure')} ${time}, ${candidate.contributionPerSeat} DT`,
    timeOffsetNote,
    passengers: passengers?.map((p) => ({ userId: p.userId, name: p.firstName, avatarUrl: p.avatarUrl })),
    // 'detour' deliberately shows no per-card detour badge — the driver
    // already sees a real, live-computed "this adds X min" indicator when
    // reviewing the actual request (RequestDetailSheet.tsx's
    // requestDetail.addsDetour), and per direct product feedback a
    // passenger shouldn't be shown internal routing-cost jargon before the
    // driver has even confirmed anything; the screen's own top banner
    // (TIER_MESSAGES.detour_match) already sets the "needs confirmation"
    // expectation in plain language.
    routeBadgeLabel: candidate.matchType === 'route_passthrough' ? t('search:results.onYourRoute') : undefined,
  };

  return (
    <DriverListCard
      theme={theme}
      bestMatch={bestMatch}
      data={data}
      onPress={onPress}
      onAvatarPress={() =>
        router.push({ pathname: '/search/trust', params: { rideId: candidate.rideId, driverUserId: candidate.driverUserId } })
      }
      avatarAccessibilityLabel={t('common:actions.viewProfile', {
        name: candidate.driverFullName ?? t('search:results.driverFallback'),
      })}
    />
  );
}

export default function ResultsScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation(['search', 'common', 'booking']);
  const locale = i18n.language as SupportedLocale;
  const { colors: theme } = useAppTheme();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const searchAt = useAppSelector((s) => s.search.searchAt);
  const searchId = useAppSelector((s) => s.search.searchId);
  const openDriver = useOpenDriver();
  // search_abandoned (docs/domain/admin-platform.md's funnel): true once a
  // result was tapped via openDriver — checked on unmount so leaving this
  // screen any other way (back button, app close) without ever selecting a
  // ride is honestly counted as abandonment.
  const selectedRef = useRef(false);

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

  // The server now returns `candidates` already ranked (matching-engine
  // architecture plan §D/§M): banded by quality, departure-time-proximity
  // as the tie-break within a band — never a manufactured precise total
  // order. Rendering `searchResult.candidates` directly (instead of
  // re-sorting by departure time client-side, which used to silently
  // discard that ranking) is the point, not an oversight; `sorted` is kept
  // as the variable name below purely to avoid a larger rename across this
  // file's render code. Memoized (rather than a bare `?? []`) so the
  // fallback empty array keeps a stable reference across renders when
  // `searchResult` is undefined — the `points`/other memos further down
  // depend on `sorted`.
  const sorted = useMemo(() => searchResult?.candidates ?? [], [searchResult]);
  // Matching-engine architecture plan §Decisions #3 / §M: never re-derive
  // "best match" from a local score comparison — the server already
  // decided whether one candidate is a genuine standout, and deliberately
  // returns null when two or more are comparably good, so both surface
  // without a crown. Comparing scores here would silently reintroduce the
  // "forced perfect ordering" this field exists to avoid.
  const bestMatchId = searchResult?.standoutRideId ?? null;

  useEffect(() => {
    if (!searchResult) return;
    if (searchResult.candidates.length > 0) {
      trackEvent('search_results_shown', {
        searchId,
        resultCount: searchResult.candidates.length,
        matchTier: searchResult.tier,
      });
    } else {
      trackEvent('search_no_results', { searchId, resultCount: 0, matchTier: searchResult.tier });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchResult]);

  useEffect(() => {
    return () => {
      if (!selectedRef.current) trackEvent('search_abandoned', { searchId });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function selectCandidate(candidate: MatchCandidate): void {
    selectedRef.current = true;
    openDriver(candidate);
  }

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
      haptics.success();
      showToast({ message: t('search:results.notifyDescription'), tone: 'success' });
    } catch {
      haptics.error();
      showToast({ message: t('search:results.notifyDescription'), tone: 'error' });
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
          onPress={() => {
            haptics.selection();
            router.back();
          }}
          hitSlop={12}
          style={styles.headerSide}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
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
          {origin && destination ? `${origin.label} → ${destination.label}` : t('search:results.title')}
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
            {searchAt ? departureBadgeLabel(new Date(searchAt), locale, t) : t('common:time.now')}
          </Text>
        </View>

        <TouchableOpacity
          onPress={() => {
            haptics.selection();
            setShowMap((v) => !v);
          }}
          style={[styles.mapToggle, { backgroundColor: theme.surfaceMuted }]}
          accessibilityRole="button"
          accessibilityLabel={showMap ? t('search:results.listView') : t('search:results.mapView')}
        >
          <Icon name={showMap ? 'list-outline' : 'map-outline'} size="xs" color={theme.ink} />
          <Text variant="caption" color={theme.ink} style={styles.mapToggleText}>
            {showMap ? t('search:results.listView') : t('search:results.mapView')}
          </Text>
        </TouchableOpacity>
      </View>

      {showMap ? (
        <View style={styles.mapWrap}>
          {mapRegion && !isLoading ? (
            <MapView provider={PROVIDER_DEFAULT} style={styles.map} initialRegion={mapRegion} customMapStyle={[]}>
              {origin ? (
                <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.5 }}>
                  <PickupPin theme={theme} />
                </Marker>
              ) : null}
              {sorted.map((candidate) => (
                <Marker
                  key={candidate.rideId}
                  coordinate={{ latitude: candidate.originLat, longitude: candidate.originLng }}
                  onPress={() => selectCandidate(candidate)}
                  zIndex={candidate.rideId === bestMatchId ? 10 : 1}
                >
                  <DriverMapPin data={toPinData(candidate, t)} recommended={candidate.rideId === bestMatchId} />
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
                  onPress={() => selectCandidate(candidate)}
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
                  notified ? t('search:results.notifyMe') : t('search:results.notifyMe')
                }
              >
                <Text variant="label" color={theme.ink} align="center">
                  {notified ? `${t('search:results.notifyMe')} ✓` : t('search:results.notifyDescription')}
                </Text>
              </TouchableOpacity>
            ) : null}
          </>
        ) : (
          <View style={styles.emptyWrap}>
            <EmptyState
              title={t('search:results.noResults')}
              actionLabel={
                notified ? `${t('search:results.notifyMe')} ✓` : t('search:results.notifyMe')
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
