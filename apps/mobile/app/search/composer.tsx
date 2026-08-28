import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text, Icon, useAppTheme, haptics, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { setOrigin, setDestination, ensureSearchSession, type SearchLocation } from '../../src/state/searchSlice';
import { useCurrentPosition } from '../../src/services/location/useCurrentPosition';
import { loadRecentPlaces, addRecentPlace } from '../../src/services/search/recentPlacesStorage';
import { trackEvent } from '../../src/services/analytics/analytics';
import {
  useLazyGeocodeAutocompleteQuery,
  useLazyGeocodePlaceDetailsQuery,
  useLazyGeocodeReverseQuery,
  type LocationType,
} from '../../src/state/api';

const SEARCH_DEBOUNCE_MS = 400;

type ActiveField = 'origin' | 'destination';

interface ResultRow {
  key: string;
  label: string;
  subLabel: string;
  /** Absent for a real recent-pick row — those already carry real lat/lng
   *  (persisted from a prior successful selection) and skip the resolve
   *  step entirely. Present for a live prediction, which must be resolved
   *  via Place Details before it has coordinates at all (brief §6/§7 —
   *  Places API (New) never returns coordinates from Autocomplete itself). */
  placeId?: string;
  type?: LocationType;
  lat?: number;
  lng?: number;
}

// A meaningful icon per location type, replacing the old generic pin +
// right-aligned text badge ("Ville"/"Pays"/"Lieu") — the icon itself now
// carries the type instead of a separate label competing with the place
// name for space. A precise coordinate (address) keeps the pin, since a pin
// is the one shape that genuinely means "exact point" — every broader type
// gets its own real icon instead.
const LOCATION_TYPE_ICON: Partial<Record<LocationType, React.ComponentProps<typeof Icon>['name']>> = {
  country: 'earth-outline',
  governorate: 'map-outline',
  city: 'business-outline',
  neighborhood: 'grid-outline',
  poi: 'storefront-outline',
  address: 'location-outline',
};
const DEFAULT_RESULT_ICON: React.ComponentProps<typeof Icon>['name'] = 'location-outline';
const RECENT_ICON: React.ComponentProps<typeof Icon>['name'] = 'time-outline';

function locationToRow(place: SearchLocation): ResultRow {
  return {
    key: place.placeId ?? `${place.lat},${place.lng}`,
    label: place.label,
    subLabel: place.subLabel ?? '',
    lat: place.lat,
    lng: place.lng,
  };
}

/** RFC-4122-shaped v4 UUID, good enough as a Places API (New) session-token
 *  correlation id (brief §7) — not used for anything security-sensitive, so
 *  a Math.random()-based generator avoids depending on a crypto.randomUUID
 *  global this codebase hasn't otherwise confirmed is available across its
 *  Hermes/RN runtime target. */
function generateSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Stitch's "Origin/Destination Selection" (stitch/search_flow/
 * search-refined-{origin,destination}-autocomplete.html) — one field fully
 * focused at a time (title, search pill, saved places, recents all swap
 * with `activeField`), not both fields visible in a shared panel. Picking a
 * place for the active field auto-advances to the other one instead of
 * requiring a second navigation; once both are set, this screen dismisses
 * itself back to the search card ((tabs)/explore.tsx) that opened it.
 *
 * The reference has no swap affordance (each field is its own screen there)
 * — explore.tsx's route card already owns that action, so it isn't
 * duplicated here.
 */
export default function SearchComposerScreen(): React.JSX.Element {
  const { field } = useLocalSearchParams<{ field?: ActiveField }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['search', 'common', 'booking']);
  const dispatch = useAppDispatch();
  const { colors: theme } = useAppTheme();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const searchId = useAppSelector((s) => s.search.searchId);
  const [activeField, setActiveField] = useState<ActiveField>(field === 'destination' ? 'destination' : 'origin');
  const [query, setQuery] = useState('');
  const { position, refresh: refreshPosition } = useCurrentPosition();
  const [recentPlaces, setRecentPlaces] = useState<SearchLocation[]>([]);
  const [isLocating, setIsLocating] = useState(false);
  const [locationDenied, setLocationDenied] = useState(false);

  useEffect(() => {
    void loadRecentPlaces().then(setRecentPlaces);
  }, []);

  // Places API (New) session-token lifecycle (brief §7): one UUID per
  // search interaction, reused across every autocomplete keystroke AND the
  // one Place Details call it leads to, then replaced — never reused across
  // unrelated searches. A ref (not state) since regenerating it must never
  // itself trigger a re-render/re-fetch the way a state update would.
  const sessionTokenRef = useRef(generateSessionToken());
  const [resolveError, setResolveError] = useState(false);

  const [triggerAutocomplete, { data: predictions, isFetching }] = useLazyGeocodeAutocompleteQuery();
  const [triggerDetails, { isFetching: isResolving }] = useLazyGeocodePlaceDetailsQuery();
  const [triggerReverseGeocode, { isFetching: isResolvingPosition }] = useLazyGeocodeReverseQuery();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      void triggerAutocomplete({ input: trimmed, sessionToken: sessionTokenRef.current });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, triggerAutocomplete]);

  const isSearching = query.trim().length >= 2;
  const rows: ResultRow[] = useMemo(() => {
    if (!isSearching) return recentPlaces.map(locationToRow);
    if (!predictions) return [];
    return predictions.map((p) => ({
      key: p.placeId,
      label: p.primaryText,
      subLabel: p.secondaryText ?? '',
      placeId: p.placeId,
      type: p.type,
    }));
  }, [isSearching, predictions, recentPlaces]);

  function activate(field: ActiveField): void {
    setActiveField(field);
    setQuery('');
    setResolveError(false);
    // A field switch is a genuinely new search interaction — never carry a
    // session token across it (brief §7, step 5: "generate a fresh token
    // for the next search session").
    sessionTokenRef.current = generateSessionToken();
  }

  function choose(place: SearchLocation): void {
    void addRecentPlace(place).then(setRecentPlaces);
    // search_started may not have fired yet if this screen was reached some
    // other way than explore.tsx's own field taps (e.g. a future deep link)
    // — ensureSearchSession is idempotent, safe to call again here.
    dispatch(ensureSearchSession());
    if (activeField === 'origin') {
      dispatch(setOrigin(place));
      trackEvent('origin_selected', {
        searchId,
        originLabel: place.label,
        originLat: place.lat,
        originLng: place.lng,
      });
      if (!destination) {
        activate('destination');
        return;
      }
    } else {
      dispatch(setDestination(place));
      trackEvent('destination_selected', {
        searchId,
        destinationLabel: place.label,
        destinationLat: place.lat,
        destinationLng: place.lng,
      });
      if (!origin) {
        activate('origin');
        return;
      }
    }
    router.back();
  }

  async function chooseRow(row: ResultRow): Promise<void> {
    // A pre-typed recent/mock row already carries real coordinates — no
    // resolve step needed (and no real session token to spend one on).
    if (row.lat !== undefined && row.lng !== undefined) {
      choose({ label: row.label, subLabel: row.subLabel || undefined, lat: row.lat, lng: row.lng });
      return;
    }
    if (!row.placeId) return;

    setResolveError(false);
    const sessionToken = sessionTokenRef.current;
    const result = await triggerDetails({ placeId: row.placeId, sessionToken }).unwrap().catch(() => null);
    if (!result) {
      // Places/Nominatim failure or an expired/mismatched session — brief
      // §29/§14: never silently drop the user's search, keep the typed
      // text and let them retry instead of navigating away on a null.
      setResolveError(true);
      return;
    }
    // The session that started with the first autocomplete keystroke ends
    // here — a fresh token is required for whatever search happens next.
    sessionTokenRef.current = generateSessionToken();
    choose({
      label: result.label,
      subLabel: result.secondaryText ?? undefined,
      lat: result.latitude,
      lng: result.longitude,
      placeId: result.placeId ?? undefined,
      type: result.type,
    });
  }

  // The row itself is tappable the instant the screen renders — it never
  // waits on (or gets disabled by) the background permission/GPS fetch that
  // starts on mount. Tapping either grabs an already-resolved fix instantly
  // or awaits that same in-flight fetch (useCurrentPosition dedupes, so this
  // never starts a second one) — the spinner only ever appears in response
  // to the tap itself, not before it.
  async function selectCurrentPosition(): Promise<void> {
    setLocationDenied(false);
    setIsLocating(true);
    try {
      const current = position ?? (await refreshPosition());
      if (!current) {
        setLocationDenied(true);
        return;
      }
      // Resolve the device fix to the real address under it (reverse
      // geocode) instead of a generic "My Location" label — the rider
      // should see the actual position that was picked, not a placeholder
      // string, matching the same reverse-geocode pattern (tabs)/publish.tsx
      // uses for a dragged map pin. Falls back to the generic label only if
      // the reverse lookup fails.
      const result = await triggerReverseGeocode(current).unwrap().catch(() => null);
      choose({
        label: result?.label ?? t('search:composer.myLocation'),
        lat: current.lat,
        lng: current.lng,
        isCurrentPosition: true,
      });
    } finally {
      setIsLocating(false);
    }
  }

  const isOrigin = activeField === 'origin';
  const title = isOrigin ? t('search:composer.searchPickup') : t('search:composer.searchDestination');
  const placeholder = isOrigin ? t('search:composer.searchPickup') : t('search:composer.searchDestination');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          style={[styles.backBtn, { backgroundColor: theme.surface, shadowColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
        >
          <Ionicons name="arrow-back" size={20} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink} numberOfLines={1} style={styles.headerTitle}>
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <Icon name="search" size="sm" color={theme.inkMuted} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={placeholder}
            placeholderTextColor={theme.inkFaint}
            style={[styles.searchInput, { color: theme.ink }]}
            autoFocus
            returnKeyType="search"
          />
          {query.length > 0 ? (
            <TouchableOpacity
              onPress={() => setQuery('')}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('search:composer.clear')}
            >
              <Icon name="close" size="sm" color={theme.inkMuted} />
            </TouchableOpacity>
          ) : isFetching || isResolving ? (
            <ActivityIndicator size="small" color={theme.inkFaint} />
          ) : null}
        </View>

        {resolveError ? (
          <Text variant="caption" color={theme.error} style={styles.errorText}>
            {t('search:composer.resolveError')}
          </Text>
        ) : null}

        {isOrigin && !isSearching ? (
          <>
            <TouchableOpacity
              style={[styles.currentPositionRow, isLocating && styles.currentPositionDisabled]}
              onPress={() => {
                haptics.selection();
                void selectCurrentPosition();
              }}
              disabled={isLocating}
              activeOpacity={0.7}
            >
              {isLocating || isResolvingPosition ? (
                <ActivityIndicator size="small" color={theme.info} />
              ) : (
                <Icon name="locate" size="sm" color={theme.info} />
              )}
              <Text variant="label" color={theme.ink}>
                {t('search:composer.myLocation')}
              </Text>
            </TouchableOpacity>
            {locationDenied ? (
              <Text variant="caption" color={theme.error} style={styles.errorText}>
                {t('search:composer.locationDenied')}
              </Text>
            ) : null}
          </>
        ) : null}

        {!isSearching ? (
          <View style={styles.savedSection}>
            <Text variant="caption" color={theme.inkFaint} style={styles.sectionLabel}>
              {t('search:composer.savedPlaces').toUpperCase()}
            </Text>
            <View style={styles.savedGrid}>
              {(['work', 'home'] as const).map((key) => (
                <TouchableOpacity
                  key={key}
                  disabled
                  style={[styles.savedCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
                  accessibilityState={{ disabled: true }}
                >
                  <View style={[styles.savedIconWrap, { backgroundColor: theme.surfaceMuted }]}>
                    <Icon
                      name={key === 'work' ? 'briefcase-outline' : 'home-outline'}
                      size="sm"
                      color={theme.outline}
                    />
                  </View>
                  <View style={styles.savedTextCol}>
                    <Text variant="bodySmall" color={theme.inkFaint} numberOfLines={1}>
                      {key === 'work' ? t('search:composer.work') : t('search:composer.home')}
                    </Text>
                    <Text variant="caption" color={theme.inkFaint}>
                      {t('common:status.comingSoon')}
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <Text variant="caption" color={theme.inkFaint} style={styles.sectionLabel}>
          {(isSearching
            ? t('search:composer.resultsSectionLabel')
            : t('search:composer.recentSectionLabel')
          ).toUpperCase()}
        </Text>

        {/* One continuous white panel instead of a per-row bordered/grey
         *  box — matches the flat, divided list every premium map app uses
         *  for search results (Google Maps, Apple Maps, Uber), rather than
         *  a stack of individually-carded rows. */}
        <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
          <FlatList
            data={rows}
            keyExtractor={(row) => row.key}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            contentContainerStyle={styles.listContent}
            scrollEnabled={rows.length > 0}
            renderItem={({ item, index }) => {
              const rowIcon = !isSearching
                ? RECENT_ICON
                : (item.type && LOCATION_TYPE_ICON[item.type]) || DEFAULT_RESULT_ICON;
              const isLast = index === rows.length - 1;
              return (
                <TouchableOpacity
                  style={[styles.placeRow, !isLast && { borderBottomColor: theme.outlineVariant, borderBottomWidth: 1 }]}
                  onPress={() => {
                    haptics.selection();
                    void chooseRow(item);
                  }}
                  activeOpacity={0.6}
                >
                  <View style={[styles.placeIconWrap, { backgroundColor: theme.accentGlow + '2E' }]}>
                    <Icon name={rowIcon} size="sm" color={theme.accentStrong} />
                  </View>
                  <View style={styles.placeTextCol}>
                    <Text variant="body" color={theme.ink} numberOfLines={1} style={styles.placeLabel}>
                      {item.label}
                    </Text>
                    {item.subLabel ? (
                      <Text variant="caption" color={theme.inkFaint} numberOfLines={1}>
                        {item.subLabel}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
              );
            }}
            ListEmptyComponent={
              isSearching && !isFetching ? (
                <Text variant="body" color={theme.inkFaint} style={styles.empty}>
                  {t('search:composer.noResults')}
                </Text>
              ) : !isSearching ? (
                <Text variant="body" color={theme.inkFaint} style={styles.empty}>
                  {t('search:composer.noRecents')}
                </Text>
              ) : null
            }
          />
        </View>
      </View>
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
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  backBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    height: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    padding: 0,
  },
  currentPositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  currentPositionDisabled: {
    opacity: 0.5,
  },
  savedSection: {
    marginTop: spacing.sm,
  },
  savedGrid: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  savedCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  savedIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  savedTextCol: {
    flex: 1,
    gap: 1,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: 0.6,
  },
  listCard: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  listContent: {
    paddingBottom: spacing['3xl'],
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  placeIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeTextCol: {
    flex: 1,
    gap: 1,
  },
  placeLabel: {
    fontWeight: '500',
  },
  errorText: {
    marginTop: spacing.xs,
  },
  empty: {
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
