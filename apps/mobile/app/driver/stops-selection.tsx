import { useEffect, useMemo, useRef, useState } from 'react';
import { View, StyleSheet, TextInput, FlatList, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { Text, Icon, Button, useAppTheme, haptics, spacing, radii } from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import {
  useGetCityDetourCandidatesQuery,
  useLazyGeocodeAutocompleteQuery,
  useLazyGeocodePlaceDetailsQuery,
  useAddCustomStopMutation,
  type LocationType,
} from '../../src/state/api';

const SEARCH_DEBOUNCE_MS = 400;

interface SelectableCity {
  key: string;
  label: string;
  subLabel?: string;
  lat: number;
  lng: number;
}

interface PredictionRow {
  key: string;
  label: string;
  subLabel: string;
  placeId: string;
  type?: LocationType;
}

/** RFC-4122-shaped v4 UUID for a Places API (New) autocomplete session
 *  token — same generator search/composer.tsx defines locally. */
function generateSessionToken(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * "Select stops" — a dedicated screen (not a BottomSheet) for the "add
 * stops" wizard step, replacing the old inline sheet per direct product
 * feedback: the sheet's fixed heightRatio left too little headroom once
 * the keyboard opened for manual search, and — the bigger ask — the
 * driver should be able to select MULTIPLE real cities from a proper
 * predefined list before confirming, not add them one at a time. A
 * dedicated full-screen route also gives the search bar a normal,
 * always-visible top position instead of a secondary, easy-to-miss
 * footer link.
 *
 * Selections are purely local (a checked/unchecked set) until "Confirmer"
 * — nothing is persisted per-tap. Confirming submits every selected city
 * as a real addCustomStop('via') call, sequentially (each insertion's
 * route-order sequencing depends on the ones already persisted), then
 * returns to the wizard, which already refetches its stop list from the
 * server rather than trusting stale local state.
 */
export default function StopsSelectionScreen(): React.JSX.Element {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation(['driver', 'common', 'search']);
  const { colors: theme } = useAppTheme();

  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Map<string, SelectableCity>>(new Map());
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const sessionTokenRef = useRef(generateSessionToken());
  const {
    data: cityCandidates,
    isFetching: isLoadingCandidates,
    isError: candidatesFailed,
  } = useGetCityDetourCandidatesQuery(rideId);
  const [triggerAutocomplete, { data: predictions, isFetching: isSearching }] =
    useLazyGeocodeAutocompleteQuery();
  const [triggerDetails, { isFetching: isResolving }] = useLazyGeocodePlaceDetailsQuery();
  const [addCustomStop] = useAddCustomStopMutation();

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) return;
    const timer = setTimeout(() => {
      void triggerAutocomplete({ input: trimmed, sessionToken: sessionTokenRef.current });
    }, SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query, triggerAutocomplete]);

  const isSearchMode = query.trim().length >= 2;

  const recommendedRows: SelectableCity[] = useMemo(
    () =>
      (cityCandidates?.cities ?? []).map((c) => ({
        key: `${c.lat},${c.lng}`,
        label: c.label,
        lat: c.lat,
        lng: c.lng,
      })),
    [cityCandidates],
  );

  const searchRows: PredictionRow[] = useMemo(() => {
    if (!isSearchMode || !predictions) return [];
    return predictions.map((p) => ({
      key: p.placeId,
      label: p.primaryText,
      subLabel: p.secondaryText ?? '',
      placeId: p.placeId,
      type: p.type,
    }));
  }, [isSearchMode, predictions]);

  function toggleCity(city: SelectableCity): void {
    haptics.selection();
    setSelected((prev) => {
      const next = new Map(prev);
      if (next.has(city.key)) next.delete(city.key);
      else next.set(city.key, city);
      return next;
    });
  }

  async function toggleSearchResult(row: PredictionRow): Promise<void> {
    // Already resolved and toggled once this session — toggling again
    // just removes it, no need to re-resolve.
    const existingKey = Array.from(selected.keys()).find((k) => k === row.placeId);
    if (existingKey) {
      setSelected((prev) => {
        const next = new Map(prev);
        next.delete(existingKey);
        return next;
      });
      return;
    }
    setErrorMessage(null);
    const sessionToken = sessionTokenRef.current;
    const result = await triggerDetails({ placeId: row.placeId, sessionToken }).unwrap().catch(() => null);
    if (!result) {
      setErrorMessage(t('search:composer.resolveError'));
      return;
    }
    sessionTokenRef.current = generateSessionToken();
    haptics.selection();
    setSelected((prev) => {
      const next = new Map(prev);
      next.set(row.placeId, {
        key: row.placeId,
        label: result.label,
        lat: result.latitude,
        lng: result.longitude,
      });
      return next;
    });
  }

  async function handleConfirm(): Promise<void> {
    if (selected.size === 0 || !rideId) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      for (const city of selected.values()) {
        // Sequential, not Promise.all — each insertion's route-order
        // sequencing (computeViaStopInsertion) depends on the stops
        // already persisted from earlier in this same loop.
        await addCustomStop({ rideId, label: city.label, lat: city.lat, lng: city.lng, role: 'via' }).unwrap();
      }
      haptics.success();
      router.back();
    } catch (err) {
      haptics.error();
      const code =
        typeof err === 'object' && err !== null && 'data' in err
          ? (err as { data?: { error?: { code?: unknown } } }).data?.error?.code
          : undefined;
      setErrorMessage(
        code === 'STOP_TOO_FAR_FROM_ROUTE'
          ? t('driver:publish.stopsStep.detourTooFar')
          : t('driver:publish.errors.stopsFailed'),
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  const selectedCount = selected.size;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          style={[styles.roundBtn, { backgroundColor: theme.surface, shadowColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
        >
          <Ionicons name="arrow-back" size={20} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink} numberOfLines={1} style={styles.headerTitle}>
          {t('driver:publish.stopsStep.chooseCityTitle')}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={[styles.searchWrap, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <Icon name="search" size="sm" color={theme.inkMuted} />
          <TextInput
            value={query}
            onChangeText={(text) => {
              setQuery(text);
              setErrorMessage(null);
            }}
            placeholder={t('driver:publish.stopsStep.searchCityPlaceholder')}
            placeholderTextColor={theme.inkFaint}
            style={[styles.searchInput, { color: theme.ink }]}
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
          ) : isSearching || isResolving ? (
            <ActivityIndicator size="small" color={theme.inkFaint} />
          ) : null}
        </View>

        {!isSearchMode ? (
          <Text variant="bodySmall" color={theme.inkMuted} style={styles.helper}>
            {t('driver:publish.stopsStep.chooseCityHelper')}
          </Text>
        ) : null}

        {errorMessage ? (
          <Text variant="caption" color={theme.error} style={styles.errorText}>
            {errorMessage}
          </Text>
        ) : null}

        <Text variant="caption" color={theme.inkFaint} style={styles.sectionLabel}>
          {(isSearchMode
            ? t('search:composer.resultsSectionLabel')
            : t('driver:publish.stopsStep.chooseCityTitle')
          ).toUpperCase()}
        </Text>

        {!isSearchMode && isLoadingCandidates ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={theme.ink} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {t('driver:publish.stopsStep.searching')}
            </Text>
          </View>
        ) : (
          <View style={[styles.listCard, { backgroundColor: theme.surface }]}>
            {isSearchMode ? (
              <FlatList
                data={searchRows}
                keyExtractor={(row) => row.key}
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={styles.listContent}
                renderItem={({ item, index }) => (
                  <SelectableRow
                    theme={theme}
                    label={item.label}
                    subLabel={item.subLabel}
                    checked={selected.has(item.placeId)}
                    isLast={index === searchRows.length - 1}
                    onPress={() => void toggleSearchResult(item)}
                  />
                )}
                ListEmptyComponent={
                  !isSearching ? (
                    <Text variant="body" color={theme.inkFaint} style={styles.empty}>
                      {t('search:composer.noResults')}
                    </Text>
                  ) : null
                }
              />
            ) : (
              <FlatList
                data={candidatesFailed ? [] : recommendedRows}
                keyExtractor={(row) => row.key}
                contentContainerStyle={styles.listContent}
                renderItem={({ item, index }) => (
                  <SelectableRow
                    theme={theme}
                    label={item.label}
                    checked={selected.has(item.key)}
                    isLast={index === recommendedRows.length - 1}
                    onPress={() => toggleCity(item)}
                  />
                )}
                ListEmptyComponent={
                  <Text variant="body" color={theme.inkFaint} style={styles.empty}>
                    {candidatesFailed
                      ? t('driver:publish.stopsStep.cityListError')
                      : t('driver:publish.stopsStep.cityListEmpty')}
                  </Text>
                }
              />
            )}
          </View>
        )}
      </View>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, borderTopColor: theme.outlineVariant }]}>
        <Button
          theme={theme}
          label={
            selectedCount > 0
              ? t('driver:publish.stopsStep.confirmSelection', { count: selectedCount })
              : t('driver:publish.stopsStep.confirmSelectionEmpty')
          }
          loading={isSubmitting}
          disabled={selectedCount === 0 || isSubmitting}
          onPress={() => void handleConfirm()}
        />
      </View>
    </View>
  );
}

function SelectableRow({
  theme,
  label,
  subLabel,
  checked,
  isLast,
  onPress,
}: {
  theme: ReturnType<typeof useAppTheme>['colors'];
  label: string;
  subLabel?: string;
  checked: boolean;
  isLast: boolean;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[styles.row, !isLast && { borderBottomColor: theme.outlineVariant, borderBottomWidth: 1 }]}
      onPress={onPress}
      activeOpacity={0.6}
      accessibilityRole="checkbox"
      accessibilityState={{ checked }}
    >
      <View style={[styles.rowIconWrap, { backgroundColor: theme.accentGlow + '2E' }]}>
        <Icon name="business-outline" size="sm" color={theme.accentStrong} />
      </View>
      <View style={styles.rowTextCol}>
        <Text variant="body" color={theme.ink} numberOfLines={1}>
          {label}
        </Text>
        {subLabel ? (
          <Text variant="caption" color={theme.inkFaint} numberOfLines={1}>
            {subLabel}
          </Text>
        ) : null}
      </View>
      <Icon
        name={checked ? 'checkmark-circle' : 'ellipse-outline'}
        size="md"
        color={checked ? theme.accent : theme.outlineVariant}
      />
    </TouchableOpacity>
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
  roundBtn: {
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
  helper: {
    marginTop: spacing.sm,
  },
  errorText: {
    marginTop: spacing.xs,
  },
  sectionLabel: {
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
    letterSpacing: 0.6,
  },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
  },
  listCard: {
    flex: 1,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  listContent: {
    paddingBottom: spacing['3xl'],
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
  },
  rowIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowTextCol: {
    flex: 1,
    gap: 1,
  },
  empty: {
    marginTop: spacing.xl,
    textAlign: 'center',
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
