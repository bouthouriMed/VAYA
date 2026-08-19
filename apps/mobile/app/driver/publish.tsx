import { useEffect, useMemo, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator } from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  Text,
  Button,
  FieldCard,
  FieldRow,
  Chip,
  DriverMapPin,
  MapRoute,
  BottomSheet,
  EmptyState,
  SkeletonBlock,
  StepProgress,
  colors,
  spacing,
  radii,
  haptics,
  regionForPoints,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { resetSearch } from '../../src/state/searchSlice';
import {
  useGetMyDriverProfileQuery,
  useCreateRideMutation,
  useGenerateCandidateStopsMutation,
  useUpdateRideStopsMutation,
  usePublishRideMutation,
  type RouteStop,
} from '../../src/state/api';
import { decodePolyline } from '../../src/utils/polyline';
import { trackEvent } from '../../src/services/analytics/analytics';
import { toggleStopSelection, buildStopSelectionPayload } from '../../src/features/driver-publish/stopSelection';

const DEPARTURE_PRESETS = [
  { label: 'Dans 15 min', minutes: 15 },
  { label: 'Dans 30 min', minutes: 30 },
  { label: 'Dans 1h', minutes: 60 },
  { label: 'Dans 2h', minutes: 120 },
];

const ROAD_CLASS_LABELS: Record<string, string> = {
  primary: 'Route principale',
  secondary: 'Route secondaire',
  residential: 'Rue résidentielle',
  motorway: 'Autoroute',
  unknown: 'Route',
};

type Step = 'form' | 'stops';

export default function PublishRideScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const [departureMinutes, setDepartureMinutes] = useState(30);
  const [seats, setSeats] = useState(3);
  const [price, setPrice] = useState(5);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  // Step 2 (candidate stop selection) state — kept local to this screen
  // rather than a new Redux slice: the whole flow lives on one route and
  // never needs to survive navigation away/back, so global state would
  // just be a God-slice-adjacent place to put screen-local UI state.
  const [step, setStep] = useState<Step>('form');
  const [rideId, setRideId] = useState<string | null>(null);
  const [ridePolyline, setRidePolyline] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RouteStop[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeStop, setActiveStop] = useState<RouteStop | null>(null);
  const [isGeneratingStops, setIsGeneratingStops] = useState(false);
  const [osrmUnavailable, setOsrmUnavailable] = useState(false);

  const { data: driverProfile, isLoading: isProfileLoading } = useGetMyDriverProfileQuery();
  const [createRide, { isLoading: isCreating }] = useCreateRideMutation();
  const [generateCandidateStops] = useGenerateCandidateStopsMutation();
  const [updateRideStops, { isLoading: isSavingStops }] = useUpdateRideStopsMutation();
  const [publishRide, { isLoading: isPublishingRide }] = usePublishRideMutation();

  useEffect(() => {
    dispatch(resetSearch());
    // Publishing starts with a clean slate — the rider search draft (if any)
    // shouldn't bleed into "where does my ride start/end".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const vehicle = driverProfile?.vehicles[0];
  const canContinue = Boolean(origin && destination && vehicle) && !isCreating;
  const isPublishing = isSavingStops || isPublishingRide;

  const routeCoordinates = useMemo(
    () => (ridePolyline ? decodePolyline(ridePolyline) : []),
    [ridePolyline],
  );
  const mapRegion = useMemo(() => {
    const points = candidates.map((c) => ({ lat: c.lat, lng: c.lng }));
    if (origin) points.push({ lat: origin.lat, lng: origin.lng });
    if (destination) points.push({ lat: destination.lat, lng: destination.lng });
    return regionForPoints(points);
  }, [candidates, origin, destination]);

  async function continueToStops(): Promise<void> {
    if (!origin || !destination || !vehicle) return;
    setErrorMessage(undefined);

    let ride: { id: string; routePolyline: string | null };
    try {
      ride = await createRide({
        vehicleId: vehicle.id,
        origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
        destination: { label: destination.label, lat: destination.lat, lng: destination.lng },
        departureAt: new Date(Date.now() + departureMinutes * 60_000),
        seatsTotal: seats,
        contributionPerSeat: price,
      }).unwrap();
    } catch {
      haptics.error();
      setErrorMessage('Impossible de créer ce trajet. Réessayez.');
      return;
    }

    setRideId(ride.id);
    setRidePolyline(ride.routePolyline);
    setStep('stops');
    setIsGeneratingStops(true);

    const startedAt = Date.now();
    try {
      const result = await generateCandidateStops(ride.id).unwrap();
      setCandidates(result.stops);
      setOsrmUnavailable(result.osrmUnavailable);
      trackEvent('ride_stop_candidates_generated', {
        rideId: ride.id,
        count: result.stops.length,
        latencyMs: Date.now() - startedAt,
        osrmUnavailable: result.osrmUnavailable,
      });
    } catch {
      setCandidates([]);
      setOsrmUnavailable(true);
    } finally {
      setIsGeneratingStops(false);
    }
  }

  function toggleStop(stop: RouteStop): void {
    haptics.selection();
    const wasSelected = selectedIds.has(stop.id);
    setSelectedIds((prev) => toggleStopSelection(prev, stop.id));
    trackEvent(wasSelected ? 'ride_stop_deselected' : 'ride_stop_selected', {
      rideId: rideId ?? undefined,
      stopId: stop.id,
    });
  }

  async function finalizePublish(): Promise<void> {
    if (!rideId) return;
    setErrorMessage(undefined);
    try {
      if (candidates.length > 0) {
        await updateRideStops({
          rideId,
          selections: buildStopSelectionPayload(candidates, selectedIds),
        }).unwrap();
      }
      if (selectedIds.size === 0) {
        trackEvent('ride_published_with_zero_stops', { rideId });
      }
      await publishRide(rideId).unwrap();
      haptics.success();
      router.replace('/(tabs)/trips');
    } catch {
      haptics.error();
      setErrorMessage('Impossible de publier ce trajet. Réessayez.');
    }
  }

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <TouchableOpacity
        onPress={() => (step === 'stops' ? setStep('form') : router.back())}
        hitSlop={12}
        style={styles.backBtn}
        accessibilityRole="button"
        accessibilityLabel="Retour"
      >
        <Ionicons name="chevron-back" size={24} color={colors.gray900} />
      </TouchableOpacity>
      <Text variant="h3">{step === 'form' ? 'Publier un trajet' : 'Arrêts suggérés'}</Text>
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

  if (step === 'stops') {
    return (
      <View style={styles.container}>
        {header}
        <StepProgress currentStep={2} totalSteps={2} style={styles.stepProgress} />

        <View style={styles.stopsBody}>
          {isGeneratingStops ? (
            <View style={styles.stopsLoading}>
              <SkeletonBlock height={280} radius="xl" />
              <Text variant="bodySmall" color={colors.gray600} align="center">
                Recherche des meilleurs points d&apos;arrêt sur votre trajet…
              </Text>
            </View>
          ) : candidates.length === 0 ? (
            <EmptyState
              title={
                osrmUnavailable
                  ? "Suggestions d'arrêts indisponibles pour le moment."
                  : "Aucun arrêt suggéré pour ce trajet."
              }
              description="Vous pouvez publier avec uniquement le point de départ et d'arrivée — c'est un trajet valide."
            />
          ) : (
            <>
              <View style={styles.mapWrap}>
                {mapRegion ? (
                  <MapView
                    provider={PROVIDER_DEFAULT}
                    style={styles.map}
                    initialRegion={mapRegion}
                  >
                    {origin ? (
                      <Marker
                        coordinate={{ latitude: origin.lat, longitude: origin.lng }}
                        anchor={{ x: 0.5, y: 0.5 }}
                      >
                        <View style={styles.originDot} />
                      </Marker>
                    ) : null}
                    {destination ? (
                      <Marker
                        coordinate={{ latitude: destination.lat, longitude: destination.lng }}
                        anchor={{ x: 0.5, y: 0.5 }}
                      >
                        <View style={styles.destinationDot} />
                      </Marker>
                    ) : null}
                    {routeCoordinates.length > 1 ? (
                      <MapRoute coordinates={routeCoordinates} showCorridor />
                    ) : null}
                    {candidates.map((stop) => (
                      <Marker
                        key={stop.id}
                        coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                        onPress={() => setActiveStop(stop)}
                      >
                        <DriverMapPin
                          variant="compact"
                          data={{ id: stop.id, name: stop.label }}
                          recommended={selectedIds.has(stop.id)}
                          accentColor={colors.secondary}
                        />
                      </Marker>
                    ))}
                  </MapView>
                ) : null}
              </View>
              <Text variant="bodySmall" color={colors.gray600} align="center" style={styles.hint}>
                Touchez un point pour l&apos;inclure ou le retirer de votre offre.
              </Text>
              <Text variant="bodySmall" color={colors.gray700} align="center">
                {selectedIds.size} arrêt(s) sélectionné(s) sur {candidates.length}
              </Text>
            </>
          )}
        </View>

        {errorMessage ? (
          <Text variant="bodySmall" color={colors.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.stopsFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            label="Publier ce trajet"
            size="lg"
            loading={isPublishing}
            disabled={isGeneratingStops || isPublishing}
            onPress={() => void finalizePublish()}
            style={styles.cta}
          />
        </View>

        <BottomSheet
          visible={activeStop !== null}
          onClose={() => setActiveStop(null)}
          title={activeStop?.label}
        >
          {activeStop ? (
            <View style={styles.sheetContent}>
              <FieldCard>
                <FieldRow
                  label="Type de route"
                  value={ROAD_CLASS_LABELS[activeStop.roadClass ?? 'unknown'] ?? 'Route'}
                />
                <FieldRow
                  label="Détour estimé"
                  value={`${activeStop.deviationMeters} m · ${Math.round(activeStop.deviationSeconds / 60) || 1} min`}
                  last
                />
              </FieldCard>
              <Button
                label={selectedIds.has(activeStop.id) ? 'Retirer ce point' : 'Inclure ce point'}
                variant={selectedIds.has(activeStop.id) ? 'outline' : 'primary'}
                size="lg"
                onPress={() => toggleStop(activeStop)}
                style={styles.cta}
              />
            </View>
          ) : null}
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <StepProgress currentStep={1} totalSteps={2} style={styles.stepProgress} />
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
          label="Continuer"
          size="lg"
          loading={isCreating}
          disabled={!canContinue}
          onPress={() => void continueToStops()}
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
  stepProgress: {
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
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
  stopsBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  stopsLoading: {
    flex: 1,
    gap: spacing.md,
    justifyContent: 'center',
  },
  mapWrap: {
    flex: 1,
    minHeight: 280,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  map: {
    flex: 1,
  },
  originDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.secondary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  destinationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: colors.primary,
    borderWidth: 2,
    borderColor: colors.white,
  },
  hint: {
    marginTop: spacing.xs,
  },
  stopsFooter: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetContent: {
    gap: spacing.lg,
  },
});
