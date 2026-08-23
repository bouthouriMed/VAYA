import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Icon, useAppTheme, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { setOrigin, setDestination, type SearchLocation } from '../../src/state/searchSlice';
import { PLACES, type MockPlace } from '../../src/mocks/seed-data';
import { useCurrentPosition } from '../../src/services/location/useCurrentPosition';
import {
  useLazyGeocodeAutocompleteQuery,
  useLazyGeocodePlaceDetailsQuery,
  type LocationType,
} from '../../src/state/api';

const SEARCH_DEBOUNCE_MS = 400;

type ActiveField = 'origin' | 'destination';

interface ResultRow {
  key: string;
  label: string;
  subLabel: string;
  /** Absent for a pre-typed recent/mock row (PLACES) — those already carry
   *  real lat/lng and skip the resolve step entirely. Present for a live
   *  prediction, which must be resolved via Place Details before it has
   *  coordinates at all (brief §6/§7 — Places API (New) never returns
   *  coordinates from Autocomplete itself). */
  placeId?: string;
  type?: LocationType;
  lat?: number;
  lng?: number;
}

// French labels for the type badge — this is the concrete fix for the
// brief's named complaint ("Sousse / Ville · Sousse Governorate / Sousse /
// Gouvernorat" reading as confusing duplicated noise): every row shows
// exactly one short, correct type word instead of the raw provider label
// repeating the place name.
const LOCATION_TYPE_LABEL: Partial<Record<LocationType, string>> = {
  country: 'Pays',
  governorate: 'Gouvernorat',
  city: 'Ville',
  neighborhood: 'Quartier',
  poi: 'Lieu',
  address: 'Adresse',
};

function placeToRow(place: MockPlace): ResultRow {
  return { key: place.id, label: place.label, subLabel: place.subLabel, lat: place.lat, lng: place.lng };
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
  const dispatch = useAppDispatch();
  const { colors: theme } = useAppTheme();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const [activeField, setActiveField] = useState<ActiveField>(field === 'destination' ? 'destination' : 'origin');
  const [query, setQuery] = useState('');
  const { status, position } = useCurrentPosition();

  // Places API (New) session-token lifecycle (brief §7): one UUID per
  // search interaction, reused across every autocomplete keystroke AND the
  // one Place Details call it leads to, then replaced — never reused across
  // unrelated searches. A ref (not state) since regenerating it must never
  // itself trigger a re-render/re-fetch the way a state update would.
  const sessionTokenRef = useRef(generateSessionToken());
  const [resolveError, setResolveError] = useState(false);

  const [triggerAutocomplete, { data: predictions, isFetching }] = useLazyGeocodeAutocompleteQuery();
  const [triggerDetails, { isFetching: isResolving }] = useLazyGeocodePlaceDetailsQuery();

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
    if (!isSearching) return PLACES.map(placeToRow);
    if (!predictions) return [];
    return predictions.map((p) => ({
      key: p.placeId,
      label: p.primaryText,
      subLabel: p.secondaryText ?? '',
      placeId: p.placeId,
      type: p.type,
    }));
  }, [isSearching, predictions]);

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
    if (activeField === 'origin') {
      dispatch(setOrigin(place));
      if (!destination) {
        activate('destination');
        return;
      }
    } else {
      dispatch(setDestination(place));
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

  function useMyPosition(): void {
    if (!position) return;
    choose({ label: 'Ma position actuelle', lat: position.lat, lng: position.lng, isCurrentPosition: true });
  }

  const isOrigin = activeField === 'origin';
  const title = isOrigin ? "D'où partez-vous ?" : 'Où allez-vous ?';
  const placeholder = isOrigin ? 'Rechercher un point de départ' : 'Rechercher une destination';

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={8}
          style={[styles.backBtn, { backgroundColor: theme.surface, shadowColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel="Retour"
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
              accessibilityLabel="Effacer"
            >
              <Icon name="close" size="sm" color={theme.inkMuted} />
            </TouchableOpacity>
          ) : isFetching || isResolving ? (
            <ActivityIndicator size="small" color={theme.inkFaint} />
          ) : null}
        </View>

        {resolveError ? (
          <Text variant="caption" color={theme.error} style={styles.errorText}>
            Impossible de récupérer ce lieu. Réessayez.
          </Text>
        ) : null}

        {isOrigin && !isSearching ? (
          <TouchableOpacity
            style={[styles.currentPositionRow, status !== 'granted' && styles.currentPositionDisabled]}
            onPress={useMyPosition}
            disabled={status !== 'granted'}
            activeOpacity={0.7}
          >
            {status === 'loading' ? (
              <ActivityIndicator size="small" color={theme.info} />
            ) : (
              <Icon name="locate" size="sm" color={theme.info} />
            )}
            <Text variant="label" color={theme.ink}>
              Ma position actuelle
            </Text>
          </TouchableOpacity>
        ) : null}

        {!isSearching ? (
          <View style={styles.savedSection}>
            <Text variant="caption" color={theme.inkFaint} style={styles.sectionLabel}>
              LIEUX ENREGISTRÉS
            </Text>
            <View style={styles.savedGrid}>
              {(['Travail', 'Domicile'] as const).map((label) => (
                <TouchableOpacity
                  key={label}
                  disabled
                  style={[styles.savedCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
                  accessibilityState={{ disabled: true }}
                >
                  <View style={[styles.savedIconWrap, { backgroundColor: theme.surfaceMuted }]}>
                    <Icon
                      name={label === 'Travail' ? 'briefcase-outline' : 'home-outline'}
                      size="sm"
                      color={theme.outline}
                    />
                  </View>
                  <View style={styles.savedTextCol}>
                    <Text variant="bodySmall" color={theme.inkFaint} numberOfLines={1}>
                      {label}
                    </Text>
                    <Text variant="caption" color={theme.inkFaint}>
                      Bientôt
                    </Text>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        <Text variant="caption" color={theme.inkFaint} style={styles.sectionLabel}>
          {isSearching ? 'RÉSULTATS' : 'RÉCENTS'}
        </Text>

        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => {
            const typeLabel = item.type ? LOCATION_TYPE_LABEL[item.type] : undefined;
            return (
              <TouchableOpacity
                style={[styles.placeRow, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
                onPress={() => void chooseRow(item)}
                activeOpacity={0.7}
              >
                <View style={[styles.placeIconWrap, { backgroundColor: theme.surfaceMuted }]}>
                  <Icon name="location-outline" size="sm" color={theme.inkMuted} />
                </View>
                <View style={styles.placeTextCol}>
                  <View style={styles.placeLabelRow}>
                    <Text
                      variant="body"
                      color={theme.ink}
                      numberOfLines={1}
                      style={[styles.placeLabel, styles.placeLabelFlex]}
                    >
                      {item.label}
                    </Text>
                    {/* One short, correct type word per row — the direct
                        fix for the brief's named "Sousse / Ville · Sousse
                        Governorate / Sousse / Gouvernorat" duplicated-noise
                        complaint: a city and its governorate now read as
                        two clearly distinct rows instead of a repeated
                        label. */}
                    {typeLabel ? (
                      <View style={[styles.typeBadge, { backgroundColor: theme.surfaceMuted }]}>
                        <Text variant="caption" color={theme.inkMuted}>
                          {typeLabel}
                        </Text>
                      </View>
                    ) : null}
                  </View>
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
                Aucun résultat
              </Text>
            ) : null
          }
        />
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
  listContent: {
    gap: spacing.sm,
    paddingBottom: spacing['3xl'],
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radii.lg,
    borderWidth: 1,
  },
  placeIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
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
  placeLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  placeLabelFlex: {
    flexShrink: 1,
  },
  typeBadge: {
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderRadius: radii.sm,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  empty: {
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
