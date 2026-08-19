import { useEffect } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  MapPreview,
  FieldCard,
  FieldRow,
  colors,
  spacing,
  radii,
  typography,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { CURRENT_USER } from '../../src/mocks/seed-data';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { setOrigin, swapOriginDestination } from '../../src/state/searchSlice';
import { useCurrentPosition } from '../../src/services/location/useCurrentPosition';

export default function HomeSearchScreen(): React.JSX.Element {
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const pickupConfirmed = useAppSelector((s) => s.search.pickupConfirmed);
  const { status, position } = useCurrentPosition();

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

      {origin ? (
        <TouchableOpacity
          style={styles.pickupCard}
          onPress={() => router.push('/search/pickup-point')}
          activeOpacity={0.7}
        >
          <View style={styles.pickupIcon}>
            <Ionicons name="locate" size={16} color={colors.white} />
          </View>
          <View style={styles.pickupTextCol}>
            <Text style={styles.pickupTitle}>Point de rendez-vous</Text>
            <Text variant="bodySmall" color={colors.gray600} numberOfLines={1}>
              {pickupConfirmed ? origin.label : 'Ajuster sur la carte'}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.gray400} />
        </TouchableOpacity>
      ) : null}

      <View style={styles.spacer} />

      <Button
        label="Rechercher"
        size="lg"
        disabled={!canSearch}
        onPress={() => router.push('/search/results')}
        style={styles.cta}
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
  pickupCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    backgroundColor: colors.white,
    borderRadius: radii.xl,
    padding: spacing.md,
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 10,
    elevation: 1,
  },
  pickupIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.secondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickupTextCol: {
    flex: 1,
  },
  pickupTitle: {
    fontSize: typography.fontSize.sm,
    fontWeight: typography.fontWeight.semibold,
    color: colors.gray900,
  },
  spacer: {
    flex: 1,
  },
  cta: {
    width: '100%',
  },
});
