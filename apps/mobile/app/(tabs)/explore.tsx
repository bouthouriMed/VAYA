import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  MapPreview,
  FieldCard,
  FieldRow,
  Chip,
  DepartureTimeSheet,
  formatDepartureLabel,
  colors,
  spacing,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { CURRENT_USER } from '../../src/mocks/seed-data';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import {
  setOrigin,
  swapOriginDestination,
  setDesiredDepartureAt,
  startSearch,
} from '../../src/state/searchSlice';
import { useCurrentPosition } from '../../src/services/location/useCurrentPosition';

/** Next occurrence of 14:00 — today if it hasn't passed yet, tomorrow
 *  otherwise. Never offers an already-past time (same rule the full
 *  DepartureTimeSheet grid enforces). */
function thisAfternoon(): Date {
  const d = new Date();
  d.setHours(14, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

function tomorrowMorning(): Date {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  d.setHours(8, 0, 0, 0);
  return d;
}

const WHEN_PRESETS: { label: string; getValue: () => Date | null }[] = [
  { label: 'Maintenant', getValue: () => null },
  { label: 'Dans 1h', getValue: () => new Date(Date.now() + 60 * 60_000) },
  { label: 'Cet après-midi', getValue: () => thisAfternoon() },
  { label: 'Demain matin', getValue: () => tomorrowMorning() },
];

export default function HomeSearchScreen(): React.JSX.Element {
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const desiredDepartureAt = useAppSelector((s) => s.search.desiredDepartureAt);
  const { status, position } = useCurrentPosition();
  const [isWhenSheetOpen, setIsWhenSheetOpen] = useState(false);

  // Silently adopt the device's GPS fix as the default departure point the
  // moment it resolves — mirrors Uber/BlaBlaCar's "we already know where you
  // are" opener. Never overwrites a value the rider already chose.
  useEffect(() => {
    if (origin || status !== 'granted' || !position) return;
    dispatch(
      setOrigin({
        label: 'Ma position actuelle',
        lat: position.lat,
        lng: position.lng,
        isCurrentPosition: true,
      }),
    );
  }, [origin, status, position, dispatch]);

  const canSearch = Boolean(origin && destination);

  function originValue(): string {
    if (origin) return origin.label;
    if (status === 'loading') return 'Localisation en cours…';
    return 'Choisir un point de départ';
  }

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <View style={styles.header}>
        <Text variant="body" color={colors.gray600}>
          Bonjour, {CURRENT_USER.fullName.split(' ')[0]}
        </Text>
        <Text variant="h2">Où allons-nous aujourd&apos;hui ?</Text>
      </View>

      <MapPreview height={180} />

      <View style={styles.fieldWrap}>
        <FieldCard>
          <FieldRow
            label="Départ"
            value={originValue()}
            dotColor={colors.secondary}
            placeholder={!origin}
            onPress={() =>
              router.push({ pathname: '/search/location', params: { field: 'origin' } })
            }
          />
          <FieldRow
            label="Arrivée"
            value={destination?.label ?? 'Où allez-vous ?'}
            dotColor={colors.primary}
            dotFilled={false}
            placeholder={!destination}
            last
            onPress={() =>
              router.push({ pathname: '/search/location', params: { field: 'destination' } })
            }
          />
        </FieldCard>
        {origin && destination ? (
          <TouchableOpacity
            style={styles.swapBtn}
            onPress={() => dispatch(swapOriginDestination())}
            hitSlop={8}
          >
            <Ionicons name="swap-vertical" size={16} color={colors.gray700} />
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.whenSection}>
        <Text variant="label" color={colors.gray700}>
          Quand ?
        </Text>
        <View style={styles.whenChipRow}>
          {WHEN_PRESETS.map((preset) => {
            const value = preset.getValue();
            const selected =
              value === null
                ? desiredDepartureAt === null
                : desiredDepartureAt === value.toISOString();
            return (
              <TouchableOpacity
                key={preset.label}
                onPress={() => dispatch(setDesiredDepartureAt(value ? value.toISOString() : null))}
              >
                <Chip label={preset.label} tone={selected ? 'default' : 'dim'} />
              </TouchableOpacity>
            );
          })}
          <TouchableOpacity onPress={() => setIsWhenSheetOpen(true)}>
            <Chip label="Choisir une date" tone="dim" />
          </TouchableOpacity>
        </View>
        {desiredDepartureAt ? (
          <TouchableOpacity onPress={() => setIsWhenSheetOpen(true)}>
            <Text variant="bodySmall" color={colors.gray600} style={styles.whenValue}>
              Départ : {formatDepartureLabel(new Date(desiredDepartureAt))}
            </Text>
          </TouchableOpacity>
        ) : null}
      </View>

      <View style={styles.spacer} />

      <Button
        label="Rechercher"
        size="lg"
        disabled={!canSearch}
        onPress={() => {
          dispatch(startSearch());
          router.push('/search/results');
        }}
        style={styles.cta}
      />

      <DepartureTimeSheet
        visible={isWhenSheetOpen}
        onClose={() => setIsWhenSheetOpen(false)}
        value={desiredDepartureAt ? new Date(desiredDepartureAt) : new Date()}
        onChange={(date) => dispatch(setDesiredDepartureAt(date.toISOString()))}
        title="Quand partez-vous ?"
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
    padding: spacing.lg,
    gap: spacing.lg,
  },
  header: {
    gap: 2,
  },
  fieldWrap: {
    position: 'relative',
  },
  whenSection: {
    gap: spacing.sm,
  },
  whenChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  whenValue: {
    marginTop: spacing.xs,
  },
  swapBtn: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    marginTop: -14,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.gray200,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  spacer: {
    flex: 1,
  },
  cta: {
    width: '100%',
  },
});
