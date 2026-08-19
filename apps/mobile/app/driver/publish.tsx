import { useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Text, Button, FieldCard, FieldRow, Chip, colors, spacing } from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { resetSearch } from '../../src/state/searchSlice';
import { useGetMyDriverProfileQuery, useCreateRideMutation } from '../../src/state/api';

const DEPARTURE_PRESETS = [
  { label: 'Dans 15 min', minutes: 15 },
  { label: 'Dans 30 min', minutes: 30 },
  { label: 'Dans 1h', minutes: 60 },
  { label: 'Dans 2h', minutes: 120 },
];

export default function PublishRideScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const [departureMinutes, setDepartureMinutes] = useState(30);
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState(5);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const { data: driverProfile, isLoading: isProfileLoading } = useGetMyDriverProfileQuery();
  const [createRide, { isLoading: isPublishing }] = useCreateRideMutation();

  useEffect(() => {
    dispatch(resetSearch());
    // Publishing starts with a clean slate — the rider search draft (if any)
    // shouldn't bleed into "where does my ride start/end".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vehicle = driverProfile?.vehicles[0];
  const canPublish = Boolean(origin && destination && vehicle) && !isPublishing;

  async function publish(): Promise<void> {
    if (!origin || !destination || !vehicle) return;
    setErrorMessage(undefined);
    try {
      await createRide({
        vehicleId: vehicle.id,
        origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
        destination: { label: destination.label, lat: destination.lat, lng: destination.lng },
        departureAt: new Date(Date.now() + departureMinutes * 60_000),
        seatsTotal: seats,
        contributionPerSeat: price,
      }).unwrap();
      router.replace('/(tabs)/trips');
    } catch {
      setErrorMessage('Impossible de publier ce trajet. Réessayez.');
    }
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <TouchableOpacity onPress={() => router.back()} hitSlop={12} style={styles.backBtn}>
        <Ionicons name="chevron-back" size={24} color={colors.gray900} />
      </TouchableOpacity>
      <Text variant="h3">Publier un trajet</Text>
      <View style={styles.backBtn} />
    </View>
  );

  if (isProfileLoading) {
    return (
      <View style={styles.container}>
        {header}
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={colors.secondary} />
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <ScrollView contentContainerStyle={styles.content}>
        <FieldCard>
          <FieldRow
            label="Départ"
            value={origin?.label ?? 'Choisir un point de départ'}
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

        <View style={styles.section}>
          <Text variant="label" color={colors.gray700}>
            Départ
          </Text>
          <View style={styles.chipRow}>
            {DEPARTURE_PRESETS.map((preset) => (
              <TouchableOpacity
                key={preset.minutes}
                onPress={() => setDepartureMinutes(preset.minutes)}
              >
                <Chip
                  label={preset.label}
                  tone={departureMinutes === preset.minutes ? 'default' : 'dim'}
                />
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="label" color={colors.gray700}>
            Places disponibles
          </Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setSeats((s) => Math.max(1, s - 1))}
            >
              <Text variant="h3">−</Text>
            </TouchableOpacity>
            <Text variant="h3" style={styles.stepperValue}>
              {seats}
            </Text>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setSeats((s) => Math.min(8, s + 1))}
            >
              <Text variant="h3">+</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="label" color={colors.gray700}>
            Contribution par place (DT)
          </Text>
          <View style={styles.stepperRow}>
            <TouchableOpacity
              style={styles.stepperBtn}
              onPress={() => setPrice((p) => Math.max(1, p - 1))}
            >
              <Text variant="h3">−</Text>
            </TouchableOpacity>
            <Text variant="h3" style={styles.stepperValue}>
              {price} DT
            </Text>
            <TouchableOpacity style={styles.stepperBtn} onPress={() => setPrice((p) => p + 1)}>
              <Text variant="h3">+</Text>
            </TouchableOpacity>
          </View>
        </View>

        {!vehicle ? (
          <Text variant="bodySmall" color={colors.error}>
            Aucun véhicule enregistré — complétez votre profil conducteur.
          </Text>
        ) : null}
        {errorMessage ? (
          <Text variant="bodySmall" color={colors.error}>
            {errorMessage}
          </Text>
        ) : null}

        <Button
          label="Publier ce trajet"
          size="lg"
          loading={isPublishing}
          disabled={!canPublish}
          onPress={() => void publish()}
          style={styles.cta}
        />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.gray100,
  },
  content: {
    padding: spacing.lg,
    gap: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  section: {
    gap: spacing.sm,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
  },
  stepperBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: colors.gray300,
  },
  stepperValue: {
    minWidth: 56,
    textAlign: 'center',
  },
  cta: {
    width: '100%',
  },
});
