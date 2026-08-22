import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Icon, useAppTheme, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { setOrigin, setDestination, type SearchLocation } from '../../src/state/searchSlice';
import { PLACES, type MockPlace } from '../../src/mocks/seed-data';
import { useCurrentPosition } from '../../src/services/location/useCurrentPosition';
import { useLazyGeocodeSearchQuery } from '../../src/state/api';

const SEARCH_DEBOUNCE_MS = 400;

type ActiveField = 'origin' | 'destination';

interface ResultRow {
  key: string;
  label: string;
  subLabel: string;
  lat: number;
  lng: number;
}

function splitLabel(fullLabel: string): { label: string; subLabel: string } {
  const [first, ...rest] = fullLabel.split(',');
  return { label: (first ?? fullLabel).trim(), subLabel: rest.join(',').trim() };
}

function placeToRow(place: MockPlace): ResultRow {
  return { key: place.id, label: place.label, subLabel: place.subLabel, lat: place.lat, lng: place.lng };
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

  const [triggerSearch, { data: searchResults, isFetching }] = useLazyGeocodeSearchQuery();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      void triggerSearch(trimmed);
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, triggerSearch]);

  const isSearching = query.trim().length >= 2;
  const rows: ResultRow[] = useMemo(() => {
    if (!isSearching) return PLACES.map(placeToRow);
    if (!searchResults) return [];
    return searchResults.map((r) => {
      const { label, subLabel } = splitLabel(r.label);
      return { key: `${r.lat},${r.lng}`, label, subLabel, lat: r.lat, lng: r.lng };
    });
  }, [isSearching, searchResults]);

  function activate(field: ActiveField): void {
    setActiveField(field);
    setQuery('');
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

  function chooseRow(row: ResultRow): void {
    choose({ label: row.label, subLabel: row.subLabel || undefined, lat: row.lat, lng: row.lng });
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
          ) : isFetching ? (
            <ActivityIndicator size="small" color={theme.inkFaint} />
          ) : null}
        </View>

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
          renderItem={({ item }) => (
            <TouchableOpacity
              style={[styles.placeRow, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
              onPress={() => chooseRow(item)}
              activeOpacity={0.7}
            >
              <View style={[styles.placeIconWrap, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="location-outline" size="sm" color={theme.inkMuted} />
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
          )}
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
  empty: {
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
