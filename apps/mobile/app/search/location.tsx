import { useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  TextInput,
  FlatList,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, colors, spacing, radii, typography } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import { useAppDispatch } from '../../src/state/store';
import { setOrigin, setDestination, type SearchLocation } from '../../src/state/searchSlice';
import { PLACES, type MockPlace } from '../../src/mocks/seed-data';
import { useCurrentPosition } from '../../src/services/location/useCurrentPosition';
import { useLazyGeocodeSearchQuery } from '../../src/state/api';

const SEARCH_DEBOUNCE_MS = 400;

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
  return {
    key: place.id,
    label: place.label,
    subLabel: place.subLabel,
    lat: place.lat,
    lng: place.lng,
  };
}

export default function LocationSearchScreen(): React.JSX.Element {
  const { field } = useLocalSearchParams<{ field?: 'origin' | 'destination' }>();
  const isOrigin = field !== 'destination';
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
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

  const rows: ResultRow[] = useMemo(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return PLACES.map(placeToRow);
    if (!searchResults) return [];
    return searchResults.map((r) => {
      const { label, subLabel } = splitLabel(r.label);
      return { key: `${r.lat},${r.lng}`, label, subLabel, lat: r.lat, lng: r.lng };
    });
  }, [query, searchResults]);

  const isSearching = query.trim().length >= 2;

  function choose(place: SearchLocation): void {
    if (isOrigin) dispatch(setOrigin(place));
    else dispatch(setDestination(place));
    router.back();
  }

  function chooseRow(row: ResultRow): void {
    choose({ label: row.label, subLabel: row.subLabel || undefined, lat: row.lat, lng: row.lng });
  }

  function useMyPosition(): void {
    if (!position) return;
    choose({
      label: 'Ma position actuelle',
      lat: position.lat,
      lng: position.lng,
      isCurrentPosition: true,
    });
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top + spacing.md }]}>
      <View style={styles.searchRow}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.gray900} />
        </TouchableOpacity>
        <View style={styles.inputWrap}>
          <Ionicons name="search" size={18} color={colors.gray500} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={isOrigin ? "D'où partez-vous ?" : 'Où allez-vous ?'}
            placeholderTextColor={colors.gray500}
            style={styles.input}
            autoFocus
            returnKeyType="search"
          />
          {isSearching && isFetching ? (
            <ActivityIndicator size="small" color={colors.gray500} />
          ) : null}
        </View>
      </View>

      {isOrigin ? (
        <TouchableOpacity
          style={[
            styles.currentPositionRow,
            status !== 'granted' && styles.currentPositionDisabled,
          ]}
          onPress={useMyPosition}
          disabled={status !== 'granted'}
          activeOpacity={0.7}
        >
          <View style={styles.currentPositionIcon}>
            {status === 'loading' ? (
              <ActivityIndicator size="small" color={colors.white} />
            ) : (
              <Ionicons name="navigate" size={16} color={colors.white} />
            )}
          </View>
          <View style={styles.currentPositionTextCol}>
            <Text style={styles.currentPositionLabel}>Ma position actuelle</Text>
            {status === 'denied' ? (
              <Text variant="bodySmall" color={colors.gray500}>
                Activez la localisation pour l&apos;utiliser
              </Text>
            ) : status === 'error' ? (
              <Text variant="bodySmall" color={colors.gray500}>
                Position indisponible
              </Text>
            ) : null}
          </View>
        </TouchableOpacity>
      ) : null}

      <Text variant="label" color={colors.gray500} style={styles.sectionLabel}>
        {isSearching ? 'Résultats' : 'Suggestions'}
      </Text>

      <FlatList
        data={rows}
        keyExtractor={(row) => row.key}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.listContent}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.placeRow} onPress={() => chooseRow(item)}>
            <View style={styles.placeIcon}>
              <Ionicons name="location" size={16} color={colors.gray600} />
            </View>
            <View style={styles.placeTextCol}>
              <Text style={styles.placeLabel}>{item.label}</Text>
              {item.subLabel ? (
                <Text variant="bodySmall" color={colors.gray500} numberOfLines={1}>
                  {item.subLabel}
                </Text>
              ) : null}
            </View>
          </TouchableOpacity>
        )}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListEmptyComponent={
          isSearching && !isFetching ? (
            <Text variant="body" color={colors.gray500} style={styles.empty}>
              Aucun résultat
            </Text>
          ) : null
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    paddingHorizontal: spacing.lg,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.white,
    borderRadius: radii.full,
    paddingHorizontal: spacing.md,
    height: 44,
  },
  input: {
    flex: 1,
    fontSize: typography.fontSize.md,
    color: colors.gray900,
  },
  currentPositionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    marginTop: spacing.lg,
  },
  currentPositionDisabled: {
    opacity: 0.6,
  },
  currentPositionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  currentPositionTextCol: {
    flex: 1,
  },
  currentPositionLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray900,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.xs,
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  listContent: {
    paddingBottom: spacing['3xl'],
  },
  placeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  placeIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
  },
  placeTextCol: {
    flex: 1,
  },
  placeLabel: {
    fontSize: typography.fontSize.md,
    fontWeight: typography.fontWeight.medium,
    color: colors.gray900,
  },
  separator: {
    height: 1,
    backgroundColor: colors.gray200,
  },
  empty: {
    marginTop: spacing.xl,
    textAlign: 'center',
  },
});
