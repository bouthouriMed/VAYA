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
  DriverMapPin,
  MapRoute,
  BottomSheet,
  DateCalendarSheet,
  TimeWheelSheet,
  GlassSurface,
  EmptyState,
  SkeletonBlock,
  PriceRangeStepper,
  Icon,
  useAppTheme,
  spacing,
  radii,
  typography,
  colors,
  haptics,
  regionForPoints,
  formatDepartureLabel,
  formatTime,
  type AppPalette,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { resetSearch } from '../../src/state/searchSlice';
import { setPendingRide, setPendingRideDraft } from '../../src/state/driverOnboardingSlice';
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

// --- Local, theme-aware building blocks -----------------------------------
// Mirrors the pattern the rider search flow's Stitch rebuild established
// (search/composer.tsx, bookings/confirmed.tsx): hand-rolled header/CTA
// chrome driven by `useAppTheme()`, rather than the old static-token
// ScreenHeader/StepProgress/Button primitives, which haven't been migrated.
// Kept local to this file (not promoted to @vaya/design-system) since
// nothing outside this wizard needs them yet.

function StepHeader({
  theme,
  title,
  onBack,
}: {
  theme: AppPalette;
  title: string;
  onBack: () => void;
}): React.JSX.Element {
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel="Retour"
      >
        <Icon name="arrow-back" size="sm" color={theme.ink} />
      </TouchableOpacity>
      <Text variant="h3" color={theme.ink} numberOfLines={1} style={styles.headerTitle}>
        {title}
      </Text>
      <View style={styles.headerSpacer} />
    </View>
  );
}

function PrimaryButton({
  theme,
  label,
  onPress,
  disabled,
  loading,
  icon,
}: {
  theme: AppPalette;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  icon?: React.ComponentProps<typeof Icon>['name'];
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={[
        styles.primaryBtn,
        { backgroundColor: theme.ink },
        (disabled || loading) && styles.btnDisabled,
      ]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.85}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
    >
      {loading ? (
        <ActivityIndicator color={theme.onInk} />
      ) : (
        <>
          <Text variant="label" color={theme.onInk}>
            {label}
          </Text>
          {icon ? <Icon name={icon} size="sm" color={theme.onInk} /> : null}
        </>
      )}
    </TouchableOpacity>
  );
}

function GhostButton({
  theme,
  label,
  onPress,
}: {
  theme: AppPalette;
  label: string;
  onPress: () => void;
}): React.JSX.Element {
  return (
    <TouchableOpacity
      style={styles.ghostBtn}
      onPress={onPress}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Text variant="label" color={theme.ink}>
        {label}
      </Text>
    </TouchableOpacity>
  );
}

// This tab renders its own content directly (no redirect to a route outside
// the tabs group) precisely so the bottom tab bar stays visible through the
// whole flow, like every other tab — reachable whether or not the user has
// a driver profile yet. A driver with none skips price/stops (no vehicle to
// compute a real ride against) straight to an honest "available after
// verification" review, and only enters KYC onboarding when they actually
// try to publish (stitch/verification/publish-verification-requirement-prompt.html).
// Profile's standalone "Become a driver" CTA remains a separate, direct
// entry into onboarding for someone who wants to verify without publishing
// a ride first.
export default function PublishTabScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const { colors: theme, scheme } = useAppTheme();
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
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [isTimeSheetOpen, setIsTimeSheetOpen] = useState(false);
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
  // cut — the step body (everything below the persistent header) re-plays
  // this on every `step` change.
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
  // No driver profile at all is now a fully supported path through this
  // wizard, not a dead end — the publish tab opens this screen regardless.
  // A vehicle is only ever required by the backend to actually create a
  // ride (rides.vehicle_id is NOT NULL), so a driver without one skips
  // straight from the form to a review screen with honest "available after
  // verification" placeholders instead of real price/stop data, and the
  // verification gate fires the moment they try to publish.
  const canContinue =
    Boolean(origin && destination) && departureAt.getTime() > Date.now() && !isCreating;
  const isPublishing = isSavingStops || isPublishingRide;
  // Only true once a real server-side ride exists (requires `vehicle`) —
  // false for a not-yet-onboarded driver, who reaches `review` directly
  // from `form`.
  const hasRideData = Boolean(rideId);

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
    () =>
      estimatedDurationSec != null
        ? new Date(departureAt.getTime() + estimatedDurationSec * 1000)
        : null,
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
  // the ride stays a saved draft either way. A driver with no vehicle yet
  // never had a server-side ride to save in the first place — this is the
  // first and only point that case needs verification at all.
  async function finalizePublish(): Promise<void> {
    setErrorMessage(undefined);

    if (!hasRideData) {
      setIsVerificationPromptVisible(true);
      return;
    }

    const saved = await saveStopSelection();
    if (!saved) return;

    if (!isVerifiedDriver(driverProfile)) {
      setIsVerificationPromptVisible(true);
      return;
    }
    await publishNow();
  }

  function startVerification(): void {
    if (!origin || !destination) return;
    setIsVerificationPromptVisible(false);
    if (rideId) {
      // A real ride already exists (draft) — only reachable today for a
      // profile whose verificationStatus isn't 'approved', which this
      // codebase's backend never actually produces (see verificationGate.ts).
      dispatch(
        setPendingRide({ rideId, originLabel: origin.label, destinationLabel: destination.label }),
      );
    } else {
      // No vehicle yet — nothing was ever created server-side. Carry the
      // form's raw values through onboarding; selfie.tsx creates (and
      // publishes) the real ride once a real vehicle exists.
      dispatch(
        setPendingRideDraft({
          originLabel: origin.label,
          originLat: origin.lat,
          originLng: origin.lng,
          destinationLabel: destination.label,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          departureAt: departureAt.toISOString(),
          seatsTotal: seats,
        }),
      );
    }
    router.push('/driver/onboarding/vehicle');
  }

  const stepTitles: Record<Exclude<Step, 'form'>, string> = {
    price: 'Prix suggéré',
    stops: 'Arrêts suggérés',
    review: 'Vérifier et publier',
  };

  // Steps beyond the form move locally within this same tab screen (never a
  // route change), so "back" here means "previous wizard step" — there's
  // always somewhere to go for these three, unlike the form step itself
  // (see the removed router.back() history note below).
  function handleWizardBack(): void {
    if (step === 'review') setStep(vehicle ? 'stops' : 'form');
    else if (step === 'stops') setStep('price');
    else if (step === 'price') setStep('form');
  }

  if (isProfileLoading) {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.loadingWrap, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={theme.accent} />
        </View>
      </View>
    );
  }

  if (step === 'price') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <StepHeader theme={theme} title={stepTitles.price} onBack={handleWizardBack} />
        </View>

        <Animated.View style={[styles.priceBody, stepMotionStyle]}>
          <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
            PRIX SUGGÉRÉ
          </Text>
          <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.priceCard}>
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
          </GlassSurface>
          <Text variant="bodySmall" color={theme.inkFaint} align="center" style={styles.hint}>
            Ce montant est calculé pour ce trajet — vous pouvez l&apos;ajuster dans la marge
            proposée.
          </Text>
        </Animated.View>

        {errorMessage ? (
          <Text variant="bodySmall" color={theme.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            theme={theme}
            label="Continuer"
            loading={isUpdatingPrice}
            disabled={!pricing}
            onPress={() => void continueToStopsFromPrice()}
          />
        </View>
      </View>
    );
  }

  if (step === 'stops') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <StepHeader theme={theme} title={stepTitles.stops} onBack={handleWizardBack} />
        </View>

        <Animated.View style={[styles.stopsBody, stepMotionStyle]}>
          {isGeneratingStops ? (
            <View style={styles.stopsLoading}>
              <SkeletonBlock height={280} radius="xl" />
              <Text variant="bodySmall" color={theme.inkFaint} align="center">
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
                          <View style={[styles.originDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
                        </Marker>
                      ) : null}
                      {destination ? (
                        <Marker
                          coordinate={{ latitude: destination.lat, longitude: destination.lng }}
                          anchor={{ x: 0.5, y: 0.5 }}
                        >
                          <View style={[styles.destinationDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
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
                            accentColor={theme.accent}
                          />
                        </Marker>
                      ))}
                    </MapView>
                  ) : null}
                </View>
              </View>
              <Text variant="bodySmall" color={theme.inkFaint} align="center" style={styles.hint}>
                Touchez un point pour l&apos;inclure ou le retirer de votre offre.
              </Text>
              <Text variant="bodySmall" color={theme.inkMuted} align="center">
                {selectedIds.size} arrêt(s) sélectionné(s) sur {candidates.length}
              </Text>
            </>
          )}
        </Animated.View>

        {errorMessage ? (
          <Text variant="bodySmall" color={theme.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            theme={theme}
            label="Continuer"
            disabled={isGeneratingStops}
            onPress={() => setStep('review')}
          />
        </View>

        <BottomSheet
          theme={theme}
          visible={activeStop !== null}
          onClose={() => setActiveStop(null)}
          title={activeStop?.label}
        >
          {activeStop ? (
            <View style={styles.sheetContent}>
              <View style={[styles.sheetRow, { borderBottomColor: theme.outlineVariant }]}>
                <Text variant="bodySmall" color={theme.inkFaint}>
                  Type de route
                </Text>
                <Text variant="label" color={theme.ink}>
                  {ROAD_CLASS_LABELS[activeStop.roadClass ?? 'unknown'] ?? 'Route'}
                </Text>
              </View>
              <View style={styles.sheetRow}>
                <Text variant="bodySmall" color={theme.inkFaint}>
                  Détour estimé
                </Text>
                <Text variant="label" color={theme.ink}>
                  {activeStop.deviationMeters} m ·{' '}
                  {Math.round(activeStop.deviationSeconds / 60) || 1} min
                </Text>
              </View>
              {selectedIds.has(activeStop.id) ? (
                <TouchableOpacity
                  style={[styles.outlineBtn, { borderColor: theme.outline }]}
                  onPress={() => toggleStop(activeStop)}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer ce point"
                >
                  <Text variant="label" color={theme.ink}>
                    Retirer ce point
                  </Text>
                </TouchableOpacity>
              ) : (
                <PrimaryButton
                  theme={theme}
                  label="Inclure ce point"
                  onPress={() => toggleStop(activeStop)}
                />
              )}
            </View>
          ) : null}
        </BottomSheet>
      </View>
    );
  }

  if (step === 'review') {
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <StepHeader theme={theme} title={stepTitles.review} onBack={handleWizardBack} />
        </View>

        <ScrollView contentContainerStyle={styles.reviewContent}>
          <Animated.View style={[styles.reviewStack, stepMotionStyle]}>
            <Text variant="h2" color={theme.ink} style={styles.reviewTitle}>
              Prêt à publier votre trajet ?
            </Text>
            <Text variant="body" color={theme.inkMuted} style={styles.reviewSubtitle}>
              Vérifiez les détails ci-dessous — vous pouvez modifier chaque section avant de
              confirmer.
            </Text>

            <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text variant="label" color={theme.inkFaint} style={styles.reviewCardEyebrow}>
                  ITINÉRAIRE
                </Text>
                <TouchableOpacity
                  style={styles.reviewEditBtn}
                  onPress={() => setStep('form')}
                  accessibilityRole="button"
                  accessibilityLabel="Modifier l'itinéraire"
                >
                  <Text variant="bodySmall" color={theme.inkMuted}>
                    Modifier
                  </Text>
                  <Icon name="pencil-outline" size="xs" color={theme.inkMuted} />
                </TouchableOpacity>
              </View>

              <View style={styles.timeline}>
                <View style={[styles.timelineLine, { backgroundColor: theme.outlineVariant }]} />

                <View style={styles.timelineRow}>
                  <View
                    style={[
                      styles.timelineDot,
                      { backgroundColor: theme.accent, borderColor: theme.surface },
                    ]}
                  />
                  <View style={styles.timelineRowContent}>
                    <View style={styles.timelineText}>
                      <Text variant="label" color={theme.ink} numberOfLines={2}>
                        {origin?.label}
                      </Text>
                    </View>
                    <Text variant="bodySmall" color={theme.inkMuted} style={styles.timelineTime}>
                      {formatTime(departureAt)}
                    </Text>
                  </View>
                </View>

                {selectedStops.map((stop) => (
                  <View key={stop.id} style={styles.timelineRow}>
                    <View
                      style={[
                        styles.timelineDotStop,
                        { backgroundColor: theme.surface, borderColor: theme.outline },
                      ]}
                    />
                    <View style={styles.timelineRowContent}>
                      <View style={styles.timelineText}>
                        <Text variant="body" color={theme.ink} numberOfLines={2}>
                          {stop.label}
                        </Text>
                        <Text variant="bodySmall" color={theme.inkFaint}>
                          {ROAD_CLASS_LABELS[stop.roadClass ?? 'unknown'] ?? 'Route'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}

                <View style={styles.timelineRow}>
                  <View
                    style={[
                      styles.timelineDot,
                      styles.timelineDotDestination,
                      { backgroundColor: theme.surface, borderColor: theme.ink },
                    ]}
                  >
                    <View style={[styles.timelineDotDestinationInner, { backgroundColor: theme.ink }]} />
                  </View>
                  <View style={styles.timelineRowContent}>
                    <View style={styles.timelineText}>
                      <Text variant="label" color={theme.ink} numberOfLines={2}>
                        {destination?.label}
                      </Text>
                    </View>
                    {estimatedArrivalAt ? (
                      <Text variant="bodySmall" color={theme.inkMuted} style={styles.timelineTime}>
                        ~{formatTime(estimatedArrivalAt)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            </GlassSurface>

            <View style={styles.reviewRow}>
              <GlassSurface
                theme={theme}
                scheme={scheme}
                radius="2xl"
                style={[styles.reviewCard, styles.reviewHalfCard]}
              >
                <View style={styles.reviewCardHeader}>
                  <Text variant="label" color={theme.inkFaint} style={styles.reviewCardEyebrow}>
                    PRIX PAR PLACE
                  </Text>
                  {hasRideData ? (
                    <TouchableOpacity
                      onPress={() => setStep('price')}
                      accessibilityRole="button"
                      accessibilityLabel="Modifier le prix"
                    >
                      <Icon name="pencil-outline" size="xs" color={theme.inkMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {hasRideData ? (
                  <View style={styles.reviewStatRow}>
                    <Text variant="h2" color={theme.ink}>
                      {price.toFixed(2)}
                    </Text>
                    <Text variant="body" color={theme.inkMuted} style={styles.reviewUnit}>
                      TND
                    </Text>
                  </View>
                ) : (
                  <View style={styles.lockedRow}>
                    <Icon name="lock-closed-outline" size="xs" color={colors.warningDark} />
                    <Text variant="bodySmall" color={colors.warningDark}>
                      Après vérification
                    </Text>
                  </View>
                )}
              </GlassSurface>

              <GlassSurface
                theme={theme}
                scheme={scheme}
                radius="2xl"
                style={[styles.reviewCard, styles.reviewHalfCard]}
              >
                <View style={styles.reviewCardHeader}>
                  <Text variant="label" color={theme.inkFaint} style={styles.reviewCardEyebrow}>
                    PLACES DISPONIBLES
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStep('form')}
                    accessibilityRole="button"
                    accessibilityLabel="Modifier le nombre de places"
                  >
                    <Icon name="pencil-outline" size="xs" color={theme.inkMuted} />
                  </TouchableOpacity>
                </View>
                <View style={styles.reviewStatRow}>
                  <Text variant="h2" color={theme.ink}>
                    {seats}
                  </Text>
                  <View style={styles.seatIcons}>
                    {Array.from({ length: Math.min(seats, 4) }).map((_, i) => (
                      <Icon key={i} name="person" size="xs" color={theme.ink} />
                    ))}
                  </View>
                </View>
              </GlassSurface>
            </View>

            {vehicle ? (
              <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.reviewCard}>
                <Text variant="label" color={theme.inkFaint} style={styles.reviewCardEyebrow}>
                  VÉHICULE
                </Text>
                <View style={styles.vehicleSummaryRow}>
                  <View style={[styles.vehicleSummaryIcon, { backgroundColor: theme.surfaceMuted }]}>
                    <Icon name="car-sport-outline" size="md" color={theme.ink} />
                  </View>
                  <View>
                    <Text variant="label" color={theme.ink}>
                      {vehicle.make} {vehicle.model} · {vehicle.color}
                    </Text>
                    <Text variant="bodySmall" color={theme.inkMuted}>
                      {vehicle.plateNumber} · {vehicle.seatCount} places au total
                    </Text>
                  </View>
                </View>
              </GlassSurface>
            ) : (
              <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.reviewCard}>
                <Text variant="label" color={theme.inkFaint} style={styles.reviewCardEyebrow}>
                  VÉHICULE
                </Text>
                <View style={styles.vehicleSummaryRow}>
                  <View style={[styles.vehicleSummaryIcon, { backgroundColor: theme.surfaceMuted }]}>
                    <Icon name="lock-closed-outline" size="sm" color={theme.inkFaint} />
                  </View>
                  <Text
                    variant="bodySmall"
                    color={theme.inkMuted}
                    style={styles.vehiclePendingText}
                  >
                    Vous ajouterez votre véhicule lors de la vérification de votre profil
                    conducteur.
                  </Text>
                </View>
              </GlassSurface>
            )}
          </Animated.View>
        </ScrollView>

        {errorMessage ? (
          <Text variant="bodySmall" color={theme.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            theme={theme}
            label={hasRideData ? 'Publier ce trajet' : 'Vérifier mon profil pour publier'}
            icon={hasRideData ? 'rocket-outline' : 'shield-checkmark-outline'}
            loading={isPublishing}
            disabled={isPublishing}
            onPress={() => void finalizePublish()}
          />
          <Text variant="bodySmall" color={theme.inkFaint} align="center" style={styles.termsHint}>
            {hasRideData
              ? "En publiant, vous acceptez nos conditions d'utilisation."
              : 'La vérification de votre profil conducteur prend environ 5 minutes.'}
          </Text>
        </View>

        <BottomSheet
          theme={theme}
          visible={isVerificationPromptVisible}
          onClose={() => setIsVerificationPromptVisible(false)}
        >
          <View style={styles.verificationSheet}>
            <View style={[styles.verificationIconWrap, { backgroundColor: theme.surfaceMuted }]}>
              <Icon name="shield-checkmark" size="lg" color={theme.ink} />
            </View>
            <Text variant="h3" color={theme.ink} align="center">
              Une dernière étape pour prendre la route
            </Text>
            <Text variant="body" color={theme.inkMuted} align="center">
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
            <PrimaryButton
              theme={theme}
              label="Commencer la vérification"
              onPress={startVerification}
            />
            <GhostButton
              theme={theme}
              label="Plus tard"
              onPress={() => setIsVerificationPromptVisible(false)}
            />
          </View>
        </BottomSheet>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScrollView contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}>
        <Animated.View style={[styles.formStack, stepMotionStyle]}>
          <Text variant="headlineDisplay" color={theme.ink}>
            Publier un trajet
          </Text>

          <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
            ITINÉRAIRE
          </Text>
          <GlassSurface theme={theme} scheme={scheme} radius="xl" style={styles.fieldCard}>
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() =>
                router.push({ pathname: '/search/composer', params: { field: 'origin' } })
              }
              accessibilityRole="button"
              accessibilityLabel={`Départ, ${origin?.label ?? 'non choisi'}`}
            >
              <View style={[styles.fieldDot, { backgroundColor: theme.accent }]} />
              <View style={styles.fieldTextCol}>
                <Text variant="caption" color={theme.inkFaint}>
                  Départ
                </Text>
                <Text
                  variant="label"
                  color={origin ? theme.ink : theme.inkFaint}
                  numberOfLines={1}
                >
                  {origin?.label ?? 'Choisir un point de départ'}
                </Text>
              </View>
            </TouchableOpacity>
            <View style={[styles.fieldDivider, { backgroundColor: theme.outlineVariant }]} />
            <TouchableOpacity
              style={styles.fieldRow}
              onPress={() =>
                router.push({ pathname: '/search/composer', params: { field: 'destination' } })
              }
              accessibilityRole="button"
              accessibilityLabel={`Arrivée, ${destination?.label ?? 'non choisie'}`}
            >
              <View style={[styles.fieldDot, styles.fieldDotOutline, { borderColor: theme.ink }]} />
              <View style={styles.fieldTextCol}>
                <Text variant="caption" color={theme.inkFaint}>
                  Arrivée
                </Text>
                <Text
                  variant="label"
                  color={destination ? theme.ink : theme.inkFaint}
                  numberOfLines={1}
                >
                  {destination?.label ?? 'Où allez-vous ?'}
                </Text>
              </View>
            </TouchableOpacity>
          </GlassSurface>

          <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
            DÉTAILS DU TRAJET
          </Text>
          <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.detailsCard}>
            <View style={styles.section}>
              <Text variant="label" color={theme.inkMuted}>
                Départ
              </Text>
              <View style={styles.chipRow}>
                {DEPARTURE_PRESETS.map((preset) => (
                  <TouchableOpacity
                    key={preset.minutes}
                    style={[
                      styles.chip,
                      selectedPresetMinutes === preset.minutes
                        ? { backgroundColor: theme.ink }
                        : { backgroundColor: theme.surfaceMuted },
                    ]}
                    onPress={() => {
                      setDepartureAt(new Date(Date.now() + preset.minutes * 60_000));
                      setSelectedPresetMinutes(preset.minutes);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={preset.label}
                    accessibilityState={{ selected: selectedPresetMinutes === preset.minutes }}
                  >
                    <Text
                      variant="caption"
                      color={selectedPresetMinutes === preset.minutes ? theme.onInk : theme.inkMuted}
                    >
                      {preset.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
              <View style={styles.paramsGrid}>
                <TouchableOpacity
                  style={[styles.paramBtn, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
                  onPress={() => setIsDateSheetOpen(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Date de départ, ${formatDepartureLabel(departureAt)}`}
                >
                  <Icon name="calendar-outline" size="sm" color={theme.inkFaint} />
                  <View>
                    <Text variant="caption" color={theme.inkFaint}>
                      Date
                    </Text>
                    <Text variant="bodySmall" color={theme.ink}>
                      {formatDepartureLabel(departureAt).split(' · ')[0]}
                    </Text>
                  </View>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.paramBtn, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
                  onPress={() => setIsTimeSheetOpen(true)}
                  activeOpacity={0.7}
                  accessibilityRole="button"
                  accessibilityLabel={`Heure de départ, ${formatTime(departureAt)}`}
                >
                  <Icon name="time-outline" size="sm" color={theme.inkFaint} />
                  <View>
                    <Text variant="caption" color={theme.inkFaint}>
                      Heure
                    </Text>
                    <Text variant="bodySmall" color={theme.ink}>
                      {formatTime(departureAt)}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>
            </View>

            <View style={[styles.section, styles.sectionDivider, { borderTopColor: theme.outlineVariant }]}>
              <Text variant="label" color={theme.inkMuted}>
                Places disponibles
              </Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.surface }]}
                  onPress={() => setSeats((s) => Math.max(1, s - 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Retirer une place"
                >
                  <Text variant="h3" color={theme.ink}>
                    −
                  </Text>
                </TouchableOpacity>
                <Text variant="h3" color={theme.ink} style={styles.stepperValue}>
                  {seats}
                </Text>
                <TouchableOpacity
                  style={[styles.stepperBtn, { backgroundColor: theme.surface }]}
                  onPress={() => setSeats((s) => Math.min(8, s + 1))}
                  accessibilityRole="button"
                  accessibilityLabel="Ajouter une place"
                >
                  <Text variant="h3" color={theme.ink}>
                    +
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </GlassSurface>

          {errorMessage ? (
            <Text variant="bodySmall" color={theme.error} style={styles.formError}>
              {errorMessage}
            </Text>
          ) : null}

          <PrimaryButton
            theme={theme}
            label="Continuer"
            loading={isCreating}
            disabled={!canContinue}
            onPress={() => (vehicle ? void continueToPrice() : setStep('review'))}
          />
        </Animated.View>
      </ScrollView>

      <DateCalendarSheet
        visible={isDateSheetOpen}
        onClose={() => setIsDateSheetOpen(false)}
        value={departureAt}
        onChange={(date) => {
          setDepartureAt(date);
          setSelectedPresetMinutes(null);
        }}
        title="Date de départ"
      />
      <TimeWheelSheet
        visible={isTimeSheetOpen}
        onClose={() => setIsTimeSheetOpen(false)}
        value={departureAt}
        onChange={(date) => {
          setDepartureAt(date);
          setSelectedPresetMinutes(null);
        }}
        title="Heure de départ"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: spacing.xl,
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
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
  fieldCard: {
    marginBottom: spacing.md,
    paddingHorizontal: spacing.md,
  },
  fieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.md,
  },
  fieldDivider: {
    height: 1,
  },
  fieldDot: {
    width: 9,
    height: 9,
    borderRadius: 5,
  },
  fieldDotOutline: {
    backgroundColor: 'transparent',
    borderWidth: 2,
  },
  fieldTextCol: {
    flex: 1,
    gap: 1,
  },
  detailsCard: {
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  section: {
    gap: spacing.sm,
  },
  sectionDivider: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
  },
  formError: {
    marginBottom: spacing.xs,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radii.full,
  },
  paramsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  paramBtn: {
    flexBasis: '47%',
    flexGrow: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
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
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperValue: {
    minWidth: 56,
    textAlign: 'center',
  },
  primaryBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.lg,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  btnDisabled: {
    opacity: 0.5,
  },
  ghostBtn: {
    width: '100%',
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineBtn: {
    width: '100%',
    minHeight: 52,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  priceBody: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.md,
  },
  priceCard: {
    padding: spacing.lg,
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
    borderWidth: 2,
  },
  destinationDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  hint: {
    marginTop: spacing.xs,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
  },
  sheetContent: {
    gap: spacing.lg,
  },
  sheetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
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
    padding: spacing.lg,
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
  lockedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  vehiclePendingText: {
    flex: 1,
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
  },
  timelineDotDestination: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
  },
  timelineDotDestinationInner: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  timelineDotStop: {
    position: 'absolute',
    left: -spacing.xl + 3,
    top: 5,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
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
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
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
