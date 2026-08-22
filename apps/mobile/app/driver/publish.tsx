import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  AccessibilityInfo,
} from 'react-native';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  Button,
  FieldCard,
  FieldRow,
  Chip,
  DriverMapPin,
  MapRoute,
  BottomSheet,
  DepartureTimeSheet,
  EmptyState,
  SkeletonBlock,
  StepProgress,
  ScreenHeader,
  PriceRangeStepper,
  Icon,
  RoutePulseBadge,
  colors,
  spacing,
  radii,
  elevation,
  typography,
  haptics,
  regionForPoints,
  formatDepartureLabel,
  formatTime,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { resetSearch } from '../../src/state/searchSlice';
import { setPendingRide } from '../../src/state/driverOnboardingSlice';
import {
  useGetMyDriverProfileQuery,
  useCreateRideMutation,
  useUpdateRideMutation,
  useGenerateCandidateStopsMutation,
  useUpdateRideStopsMutation,
  usePublishRideMutation,
  useRegisterPushTokenMutation,
  type RouteStop,
  type SuggestedPrice,
} from '../../src/state/api';
import { decodePolyline } from '../../src/utils/polyline';
import { trackEvent } from '../../src/services/analytics/analytics';
import { requestPushPermissionAndRegister } from '../../src/services/notifications/registerForPushNotifications';
import {
  toggleStopSelection,
  buildStopSelectionPayload,
} from '../../src/features/driver-publish/stopSelection';
import { resolveInitialPrice } from '../../src/features/driver-publish/priceSelection';
import { isVerifiedDriver } from '../../src/features/driver-publish/verificationGate';

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

type Step = 'form' | 'price' | 'stops' | 'review';

export default function PublishRideScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  // Departure is a real date/time (any day, any half-hour slot), not just a
  // relative-minutes offset — DEPARTURE_PRESETS below stay as fast one-tap
  // shortcuts for the common "leaving soon" case, but a driver publishing a
  // ride for tomorrow or next week needs `departureAt` to hold an arbitrary
  // instant, which `selectedPresetMinutes` (highlighting only) can't express.
  const [departureAt, setDepartureAt] = useState(() => new Date(Date.now() + 30 * 60_000));
  const [selectedPresetMinutes, setSelectedPresetMinutes] = useState<number | null>(30);
  const [isDepartureSheetOpen, setIsDepartureSheetOpen] = useState(false);
  const [seats, setSeats] = useState(3);
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  // Step 2 (price) and step 3 (candidate stop selection) state — kept local
  // to this screen rather than a new Redux slice: the whole flow lives on
  // one route and never needs to survive navigation away/back, so global
  // state would just be a God-slice-adjacent place to put screen-local UI
  // state.
  const [step, setStep] = useState<Step>('form');
  const [rideId, setRideId] = useState<string | null>(null);
  const [ridePolyline, setRidePolyline] = useState<string | null>(null);
  // Phase 6 (docs/domain/pricing.md): the server-computed bound, known only
  // once the ride (and thus its route) exists — `price` is the driver's
  // current (possibly adjusted) value within that bound, pre-filled with
  // `pricing.recommended`.
  const [pricing, setPricing] = useState<SuggestedPrice | null>(null);
  const [routeIsEstimate, setRouteIsEstimate] = useState(false);
  const [estimatedDurationSec, setEstimatedDurationSec] = useState<number | null>(null);
  const [price, setPrice] = useState(0);
  const [candidates, setCandidates] = useState<RouteStop[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [activeStop, setActiveStop] = useState<RouteStop | null>(null);
  const [isGeneratingStops, setIsGeneratingStops] = useState(false);
  const [osrmUnavailable, setOsrmUnavailable] = useState(false);
  // Review step (stitch/verification/publish-verification-requirement-prompt.html):
  // shown over the review screen when the driver isn't verified yet — the
  // ride is already saved as a draft by this point (createRide below).
  const [isVerificationPromptVisible, setIsVerificationPromptVisible] = useState(false);

  const { data: driverProfile, isLoading: isProfileLoading } = useGetMyDriverProfileQuery();
  const [createRide, { isLoading: isCreating }] = useCreateRideMutation();
  const [updateRide, { isLoading: isUpdatingPrice }] = useUpdateRideMutation();
  const [generateCandidateStops] = useGenerateCandidateStopsMutation();
  const [updateRideStops, { isLoading: isSavingStops }] = useUpdateRideStopsMutation();
  const [publishRide, { isLoading: isPublishingRide }] = usePublishRideMutation();
  const [registerPushToken] = useRegisterPushTokenMutation();

  useEffect(() => {
    dispatch(resetSearch());
    // Publishing starts with a clean slate — the rider search draft (if any)
    // shouldn't bleed into "where does my ride start/end".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cross-fade + slight rise between the three steps instead of an instant
  // cut — the step body (everything below the persistent header/progress
  // bar) re-plays this on every `step` change.
  const stepFade = useRef(new Animated.Value(1)).current;
  const stepRise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((reduced) => {
      if (cancelled) return;
      if (reduced) {
        stepFade.setValue(1);
        stepRise.setValue(0);
        return;
      }
      stepFade.setValue(0);
      stepRise.setValue(10);
      Animated.parallel([
        Animated.timing(stepFade, { toValue: 1, duration: 260, useNativeDriver: true }),
        Animated.timing(stepRise, { toValue: 0, duration: 260, useNativeDriver: true }),
      ]).start();
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);
  const stepMotionStyle = { opacity: stepFade, transform: [{ translateY: stepRise }] };

  const vehicle = driverProfile?.vehicles[0];
  const canContinue =
    Boolean(origin && destination && vehicle) && departureAt.getTime() > Date.now() && !isCreating;
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
  // Review step (stitch/publish_ride/publish-final-review.html)'s itinerary
  // timeline — driver-selected stops only, in route order.
  const selectedStops = useMemo(
    () =>
      candidates.filter((c) => selectedIds.has(c.id)).sort((a, b) => a.sequence - b.sequence),
    [candidates, selectedIds],
  );
  // No per-stop ETA exists anywhere in this codebase (only the whole
  // route's total duration) — showing one here for the destination only is
  // real data; inventing per-stop times would violate the "never fabricate"
  // rule (CLAUDE.md).
  const estimatedArrivalAt = useMemo(
    () => (estimatedDurationSec != null ? new Date(departureAt.getTime() + estimatedDurationSec * 1000) : null),
    [departureAt, estimatedDurationSec],
  );

  // Runs candidate-stop generation without blocking the caller — kicked off
  // as soon as the ride exists (right after continueToPrice) so it's ready,
  // or well underway, by the time the driver finishes the price step
  // instead of making them wait twice in sequence.
  async function generateStopsInBackground(newRideId: string): Promise<void> {
    setIsGeneratingStops(true);
    const startedAt = Date.now();
    try {
      const result = await generateCandidateStops(newRideId).unwrap();
      setCandidates(result.stops);
      setOsrmUnavailable(result.osrmUnavailable);
      trackEvent('ride_stop_candidates_generated', {
        rideId: newRideId,
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

  async function continueToPrice(): Promise<void> {
    if (!origin || !destination || !vehicle) return;
    setErrorMessage(undefined);

    let ride: {
      id: string;
      routePolyline: string | null;
      pricing: SuggestedPrice;
      routeIsEstimate: boolean;
      estimatedDurationSec: number | null;
    };
    try {
      ride = await createRide({
        vehicleId: vehicle.id,
        origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
        destination: { label: destination.label, lat: destination.lat, lng: destination.lng },
        departureAt,
        seatsTotal: seats,
        // Phase 6 (docs/domain/pricing.md): price is deliberately omitted
        // here — the driver hasn't seen a route-derived bound yet, so
        // there's nothing meaningful to submit. The server computes the
        // route, derives {min, recommended, max}, and defaults
        // contributionPerSeat to `recommended`; the driver adjusts it on
        // the next step, once real bounds exist.
      }).unwrap();
    } catch {
      haptics.error();
      setErrorMessage('Impossible de créer ce trajet. Réessayez.');
      return;
    }

    setRideId(ride.id);
    setRidePolyline(ride.routePolyline);
    setPricing(ride.pricing);
    setRouteIsEstimate(ride.routeIsEstimate);
    setEstimatedDurationSec(ride.estimatedDurationSec);
    setPrice(resolveInitialPrice(ride.pricing.min, ride.pricing.recommended, ride.pricing.max));
    setStep('price');
    trackEvent('ride_price_suggested', {
      rideId: ride.id,
      min: ride.pricing.min,
      recommended: ride.pricing.recommended,
      max: ride.pricing.max,
      routeIsEstimate: ride.routeIsEstimate,
    });

    void generateStopsInBackground(ride.id);
  }

  async function continueToStopsFromPrice(): Promise<void> {
    if (!rideId || !pricing) return;
    setErrorMessage(undefined);

    if (price !== pricing.recommended) {
      try {
        const updated = await updateRide({
          rideId,
          input: { contributionPerSeat: price },
        }).unwrap();
        // Bounds can't realistically change between create and this call
        // (same route), but stay consistent with whatever the server just
        // independently re-validated against, not the stale local copy.
        setPricing(updated.pricing);
        trackEvent('ride_price_adjusted_from_suggestion', {
          rideId,
          recommended: pricing.recommended,
          adjustedTo: price,
          delta: Math.round((price - pricing.recommended) * 100) / 100,
        });
      } catch {
        haptics.error();
        setErrorMessage('Impossible de mettre à jour le prix. Réessayez.');
        return;
      }
    }

    setStep('stops');
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

  // Persists the driver's stop selection — always safe to call before the
  // ride is actually published, since it's just updating the draft.
  async function saveStopSelection(): Promise<boolean> {
    if (!rideId) return false;
    try {
      if (candidates.length > 0) {
        await updateRideStops({
          rideId,
          selections: buildStopSelectionPayload(candidates, selectedIds),
        }).unwrap();
      }
      return true;
    } catch {
      haptics.error();
      setErrorMessage("Impossible d'enregistrer les arrêts. Réessayez.");
      return false;
    }
  }

  async function publishNow(): Promise<void> {
    if (!rideId) return;
    if (selectedIds.size === 0) {
      trackEvent('ride_published_with_zero_stops', { rideId });
    }
    try {
      await publishRide(rideId).unwrap();
      haptics.success();
      // Contextual push-permission prompt (docs/roadmap/phase-07-notifications.md):
      // a driver's first published ride is a real reason to ask — never
      // blocks navigation, and is a silent no-op after the first prompt.
      void requestPushPermissionAndRegister((args) => registerPushToken(args).unwrap());
      router.replace('/(tabs)/trips');
    } catch {
      haptics.error();
      setErrorMessage('Impossible de publier ce trajet. Réessayez.');
    }
  }

  // Review screen's "Publier ce trajet" (stitch/publish_ride/publish-final-review.html):
  // saves the stop selection either way, then either publishes immediately
  // (verified driver) or hands off to the verification-requirement prompt
  // (stitch/verification/publish-verification-requirement-prompt.html) —
  // the ride stays a saved draft either way.
  async function finalizePublish(): Promise<void> {
    setErrorMessage(undefined);
    const saved = await saveStopSelection();
    if (!saved) return;

    if (!isVerifiedDriver(driverProfile)) {
      setIsVerificationPromptVisible(true);
      return;
    }
    await publishNow();
  }

  function startVerification(): void {
    if (!rideId || !origin || !destination) return;
    setIsVerificationPromptVisible(false);
    dispatch(setPendingRide({ rideId, originLabel: origin.label, destinationLabel: destination.label }));
    router.push('/driver/onboarding/vehicle');
  }

  const stepTitles: Record<Step, string> = {
    form: 'Publier un trajet',
    price: 'Prix suggéré',
    stops: 'Arrêts suggérés',
    review: 'Vérifier et publier',
  };

  const header = (
    <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
      <ScreenHeader
        title={stepTitles[step]}
        onBack={() => {
          if (step === 'review') setStep('stops');
          else if (step === 'stops') setStep('price');
          else if (step === 'price') setStep('form');
          else router.back();
        }}
      />
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

  if (step === 'price') {
    return (
      <View style={styles.container}>
        {header}
        <StepProgress currentStep={2} totalSteps={4} style={styles.stepProgress} />

        <Animated.View style={[styles.priceBody, stepMotionStyle]}>
          <Text variant="caption" color={colors.secondaryDark} style={styles.eyebrow}>
            PRIX SUGGÉRÉ
          </Text>
          <View style={styles.priceCard}>
            {pricing ? (
              <PriceRangeStepper
                min={pricing.min}
                max={pricing.max}
                recommended={pricing.recommended}
                value={price}
                onChange={setPrice}
                isEstimate={routeIsEstimate}
              />
            ) : null}
          </View>
          <Text variant="bodySmall" color={colors.gray600} align="center" style={styles.hint}>
            Ce montant est calculé pour ce trajet — vous pouvez l&apos;ajuster dans la marge
            proposée.
          </Text>
        </Animated.View>

        {errorMessage ? (
          <Text variant="bodySmall" color={colors.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.stopsFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            label="Continuer"
            size="lg"
            loading={isUpdatingPrice}
            disabled={!pricing}
            onPress={() => void continueToStopsFromPrice()}
            style={styles.cta}
          />
        </View>
      </View>
    );
  }

  if (step === 'stops') {
    return (
      <View style={styles.container}>
        {header}
        <StepProgress currentStep={3} totalSteps={4} style={styles.stepProgress} />

        <Animated.View style={[styles.stopsBody, stepMotionStyle]}>
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
                  : 'Aucun arrêt suggéré pour ce trajet.'
              }
              description="Vous pouvez publier avec uniquement le point de départ et d'arrivée — c'est un trajet valide."
            />
          ) : (
            <>
              <View style={styles.mapShadowWrap}>
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
              </View>
              <Text variant="bodySmall" color={colors.gray600} align="center" style={styles.hint}>
                Touchez un point pour l&apos;inclure ou le retirer de votre offre.
              </Text>
              <Text variant="bodySmall" color={colors.gray700} align="center">
                {selectedIds.size} arrêt(s) sélectionné(s) sur {candidates.length}
              </Text>
            </>
          )}
        </Animated.View>

        {errorMessage ? (
          <Text variant="bodySmall" color={colors.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.stopsFooter, { paddingBottom: insets.bottom + spacing.md }]}>
          <Button
            label="Continuer"
            size="lg"
            disabled={isGeneratingStops}
            onPress={() => setStep('review')}
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

  if (step === 'review') {
    return (
      <View style={styles.container}>
        {header}
        <StepProgress currentStep={4} totalSteps={4} style={styles.stepProgress} />

        <ScrollView contentContainerStyle={styles.reviewContent}>
          <Animated.View style={[styles.reviewStack, stepMotionStyle]}>
            <Text variant="h2" style={styles.reviewTitle}>
              Prêt à publier votre trajet ?
            </Text>
            <Text variant="body" color={colors.gray600} style={styles.reviewSubtitle}>
              Vérifiez les détails ci-dessous — vous pouvez modifier chaque section avant de
              confirmer.
            </Text>

            <View style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text variant="label" color={colors.gray600} style={styles.reviewCardEyebrow}>
                  ITINÉRAIRE
                </Text>
                <TouchableOpacity
                  style={styles.reviewEditBtn}
                  onPress={() => setStep('form')}
                  accessibilityRole="button"
                  accessibilityLabel="Modifier l'itinéraire"
                >
                  <Text variant="bodySmall" color={colors.gray700}>
                    Modifier
                  </Text>
                  <Icon name="pencil-outline" size="xs" color={colors.gray700} />
                </TouchableOpacity>
              </View>

              <View style={styles.timeline}>
                <View style={styles.timelineLine} />

                <View style={styles.timelineRow}>
                  <View style={[styles.timelineDot, styles.timelineDotOrigin]} />
                  <View style={styles.timelineRowContent}>
                    <View style={styles.timelineText}>
                      <Text variant="label" numberOfLines={2}>
                        {origin?.label}
                      </Text>
                    </View>
                    <Text variant="bodySmall" color={colors.gray700} style={styles.timelineTime}>
                      {formatTime(departureAt)}
                    </Text>
                  </View>
                </View>

                {selectedStops.map((stop) => (
                  <View key={stop.id} style={styles.timelineRow}>
                    <View style={styles.timelineDotStop} />
                    <View style={styles.timelineRowContent}>
                      <View style={styles.timelineText}>
                        <Text variant="body" numberOfLines={2}>
                          {stop.label}
                        </Text>
                        <Text variant="bodySmall" color={colors.gray600}>
                          {ROAD_CLASS_LABELS[stop.roadClass ?? 'unknown'] ?? 'Route'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}

                <View style={styles.timelineRow}>
                  <View style={[styles.timelineDot, styles.timelineDotDestination]}>
                    <View style={styles.timelineDotDestinationInner} />
                  </View>
                  <View style={styles.timelineRowContent}>
                    <View style={styles.timelineText}>
                      <Text variant="label" numberOfLines={2}>
                        {destination?.label}
                      </Text>
                    </View>
                    {estimatedArrivalAt ? (
                      <Text variant="bodySmall" color={colors.gray700} style={styles.timelineTime}>
                        ~{formatTime(estimatedArrivalAt)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </View>

            <View style={styles.reviewRow}>
              <View style={[styles.reviewCard, styles.reviewHalfCard]}>
                <View style={styles.reviewCardHeader}>
                  <Text variant="label" color={colors.gray600} style={styles.reviewCardEyebrow}>
                    PRIX PAR PLACE
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStep('price')}
                    accessibilityRole="button"
                    accessibilityLabel="Modifier le prix"
                  >
                    <Icon name="pencil-outline" size="xs" color={colors.gray700} />
                  </TouchableOpacity>
                </View>
                <View style={styles.reviewStatRow}>
                  <Text variant="h2">{price.toFixed(2)}</Text>
                  <Text variant="body" color={colors.gray600} style={styles.reviewUnit}>
                    TND
                  </Text>
                </View>
              </View>

              <View style={[styles.reviewCard, styles.reviewHalfCard]}>
                <View style={styles.reviewCardHeader}>
                  <Text variant="label" color={colors.gray600} style={styles.reviewCardEyebrow}>
                    PLACES DISPONIBLES
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStep('form')}
                    accessibilityRole="button"
                    accessibilityLabel="Modifier le nombre de places"
                  >
                    <Icon name="pencil-outline" size="xs" color={colors.gray700} />
                  </TouchableOpacity>
                </View>
                <View style={styles.reviewStatRow}>
                  <Text variant="h2">{seats}</Text>
                  <View style={styles.seatIcons}>
                    {Array.from({ length: Math.min(seats, 4) }).map((_, i) => (
                      <Icon key={i} name="person" size="xs" color={colors.primary} />
                    ))}
                  </View>
                </View>
              </View>
            </View>

            {vehicle ? (
              <View style={styles.reviewCard}>
                <Text variant="label" color={colors.gray600} style={styles.reviewCardEyebrow}>
                  VÉHICULE
                </Text>
                <View style={styles.vehicleSummaryRow}>
                  <View style={styles.vehicleSummaryIcon}>
                    <Icon name="car-sport-outline" size="md" color={colors.gray900} />
                  </View>
                  <View>
                    <Text variant="label">
                      {vehicle.make} {vehicle.model} · {vehicle.color}
                    </Text>
                    <Text variant="bodySmall" color={colors.gray600}>
                      {vehicle.plateNumber} · {vehicle.seatCount} places au total
                    </Text>
                  </View>
                </View>
              </View>
            ) : null}
          </Animated.View>
        </ScrollView>

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
            disabled={isPublishing}
            onPress={() => void finalizePublish()}
            style={styles.cta}
          />
          <Text variant="bodySmall" color={colors.gray600} align="center" style={styles.termsHint}>
            En publiant, vous acceptez nos conditions d&apos;utilisation.
          </Text>
        </View>

        <BottomSheet
          visible={isVerificationPromptVisible}
          onClose={() => setIsVerificationPromptVisible(false)}
        >
          <View style={styles.verificationSheet}>
            <View style={styles.verificationIconWrap}>
              <RoutePulseBadge icon="shield-checkmark" size="md" tone="onCream" />
            </View>
            <Text variant="h3" align="center">
              Une dernière étape pour prendre la route
            </Text>
            <Text variant="body" color={colors.gray600} align="center">
              Pour publier votre premier trajet, nous devons vérifier votre profil de conducteur.
              Votre trajet est enregistré et sera publié automatiquement dès que votre
              vérification sera validée.
            </Text>
            <View style={styles.verificationPill}>
              <Icon name="hourglass-outline" size="xs" color={colors.warningDark} />
              <Text variant="bodySmall" color={colors.warningDark}>
                Vérification requise
              </Text>
            </View>
            <Button
              label="Commencer la vérification"
              size="lg"
              onPress={startVerification}
              style={styles.cta}
            />
            <Button
              label="Plus tard"
              variant="ghost"
              size="lg"
              onPress={() => setIsVerificationPromptVisible(false)}
              style={styles.cta}
            />
          </View>
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {header}
      <StepProgress currentStep={1} totalSteps={3} style={styles.stepProgress} />
      <ScrollView contentContainerStyle={styles.content}>
        <Animated.View style={[styles.formStack, stepMotionStyle]}>
          <Text variant="caption" color={colors.secondaryDark} style={styles.eyebrow}>
            ITINÉRAIRE
          </Text>
          <FieldCard style={styles.fieldCardSpacing}>
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

          <Text variant="caption" color={colors.secondaryDark} style={styles.eyebrow}>
            DÉTAILS DU TRAJET
          </Text>
          <View style={styles.detailsCard}>
            <View style={styles.section}>
              <Text variant="label" color={colors.gray700}>
                Départ
              </Text>
              <View style={styles.chipRow}>
                {DEPARTURE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.minutes}
                    onPress={() => {
                      setDepartureAt(new Date(Date.now() + preset.minutes * 60_000));
                      setSelectedPresetMinutes(preset.minutes);
                    }}
                  >
                    <Chip
                      label={preset.label}
                      tone={selectedPresetMinutes === preset.minutes ? 'default' : 'dim'}
                    />
                  </TouchableOpacity>
                ))}
                <TouchableOpacity onPress={() => setIsDepartureSheetOpen(true)}>
                  <Chip
                    label="Choisir une date"
                    tone={selectedPresetMinutes === null ? 'default' : 'dim'}
                  />
                </TouchableOpacity>
              </View>
              <TouchableOpacity
                onPress={() => setIsDepartureSheetOpen(true)}
                accessibilityRole="button"
                accessibilityLabel={`Départ prévu, ${formatDepartureLabel(departureAt)}`}
              >
                <Text variant="body" color={colors.gray900} style={styles.departureValue}>
                  {formatDepartureLabel(departureAt)}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={[styles.section, styles.sectionDivider]}>
              <Text variant="label" color={colors.gray700}>
                Places disponibles
              </Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setSeats((s) => Math.max(1, s - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer une place"
                >
                  <Text variant="h3" color={colors.primary}>
                    −
                  </Text>
                </TouchableOpacity>
                <Text variant="h3" style={styles.stepperValue}>
                  {seats}
                </Text>
                <TouchableOpacity
                  style={styles.stepperBtn}
                  onPress={() => setSeats((s) => Math.min(8, s + 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une place"
                >
                  <Text variant="h3" color={colors.primary}>
                    +
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {!vehicle ? (
            <Text variant="bodySmall" color={colors.error} style={styles.formError}>
              Aucun véhicule enregistré — complétez votre profil conducteur.
            </Text>
          ) : null}
          {errorMessage ? (
            <Text variant="bodySmall" color={colors.error} style={styles.formError}>
              {errorMessage}
            </Text>
          ) : null}

          <Button
            label="Continuer"
            size="lg"
            loading={isCreating}
            disabled={!canContinue}
            onPress={() => void continueToPrice()}
            style={styles.cta}
          />
        </Animated.View>
      </ScrollView>

      <DepartureTimeSheet
        visible={isDepartureSheetOpen}
        onClose={() => setIsDepartureSheetOpen(false)}
        value={departureAt}
        onChange={(date) => {
          setDepartureAt(date);
          setSelectedPresetMinutes(null);
        }}
        title="Départ prévu"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
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
    paddingBottom: spacing['4xl'],
  },
  formStack: {
    gap: spacing.sm,
  },
  eyebrow: {
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  fieldCardSpacing: {
    marginBottom: spacing.md,
  },
  detailsCard: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    marginBottom: spacing.md,
    ...elevation?.lg,
    shadowColor: colors.gray900,
  },
  section: {
    gap: spacing.sm,
  },
  sectionDivider: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.gray100,
  },
  formError: {
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  departureValue: {
    marginTop: spacing.sm,
    fontWeight: typography.fontWeight.semibold,
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
    ...elevation?.lg,
    shadowColor: colors.primary,
  },
  priceBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  priceCard: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    ...elevation?.lg,
    shadowColor: colors.gray900,
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
  mapShadowWrap: {
    flex: 1,
    minHeight: 280,
    borderRadius: radii.xl,
    ...elevation?.lg,
    shadowColor: colors.gray900,
  },
  mapWrap: {
    flex: 1,
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
  reviewContent: {
    padding: spacing.lg,
    paddingBottom: spacing['4xl'],
  },
  reviewStack: {
    gap: spacing.md,
  },
  reviewTitle: {
    fontWeight: typography.fontWeight.bold,
  },
  reviewSubtitle: {
    marginBottom: spacing.sm,
  },
  reviewCard: {
    backgroundColor: colors.white,
    borderRadius: radii['2xl'],
    padding: spacing.lg,
    ...elevation?.lg,
    shadowColor: colors.gray900,
  },
  reviewCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  reviewCardEyebrow: {
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1,
  },
  reviewEditBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  reviewRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  reviewHalfCard: {
    flex: 1,
  },
  reviewStatRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: spacing.xs,
  },
  reviewUnit: {
    paddingBottom: 2,
  },
  seatIcons: {
    flexDirection: 'row',
    gap: 2,
    marginLeft: spacing.xs,
  },
  timeline: {
    position: 'relative',
    paddingLeft: spacing.xl,
  },
  timelineLine: {
    position: 'absolute',
    left: 7,
    top: 8,
    bottom: 8,
    width: 2,
    backgroundColor: colors.gray200,
  },
  timelineRow: {
    marginBottom: spacing.md,
  },
  timelineRowContent: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  timelineText: {
    flex: 1,
  },
  timelineTime: {
    fontWeight: typography.fontWeight.semibold,
  },
  timelineDot: {
    position: 'absolute',
    left: -spacing.xl,
    top: 2,
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 3,
    borderColor: colors.white,
  },
  timelineDotOrigin: {
    backgroundColor: colors.secondary,
  },
  timelineDotDestination: {
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  timelineDotDestinationInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: colors.primary,
  },
  timelineDotStop: {
    position: 'absolute',
    left: -spacing.xl + 3,
    top: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: colors.white,
    borderWidth: 2,
    borderColor: colors.gray400,
  },
  vehicleSummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  vehicleSummaryIcon: {
    width: 40,
    height: 40,
    borderRadius: radii.lg,
    backgroundColor: colors.gray100,
    alignItems: 'center',
    justifyContent: 'center',
  },
  termsHint: {
    marginTop: spacing.sm,
  },
  verificationSheet: {
    alignItems: 'center',
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  verificationIconWrap: {
    marginTop: spacing.sm,
  },
  verificationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: colors.warningLight,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
});
