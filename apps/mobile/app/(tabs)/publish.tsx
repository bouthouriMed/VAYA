import { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Animated,
  AccessibilityInfo,
  useWindowDimensions,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Text,
  MapRoute,
  BottomSheet,
  DateCalendarSheet,
  TimeWheelSheet,
  GlassSurface,
  PriceRangeStepper,
  Icon,
  useAppTheme,
  spacing,
  radii,
  typography,
  colors,
  haptics,
  regionForPoints,
  lightMapStyle,
  darkMapStyle,
  StatusBarBlend,
  formatDepartureLabel,
  formatTime,
  type AppPalette,
  type MapRegion,
} from '@vaya/design-system';
import { router } from 'expo-router';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { resetSearch } from '../../src/state/searchSlice';
import { setPendingRide, setPendingRideDraft } from '../../src/state/driverOnboardingSlice';
import { useContextualAuth } from '../../src/features/auth/useContextualAuth';
import { ContextualAuthSheet } from '../../src/features/auth/ContextualAuthSheet';
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
import { buildStopSelectionPayload } from '../../src/features/driver-publish/stopSelection';
import { resolveInitialPrice } from '../../src/features/driver-publish/priceSelection';
import { isVerifiedDriver } from '../../src/features/driver-publish/verificationGate';
import { buildRecommendedPoints } from '../../src/features/driver-publish/nearestStops';
import { MapSelectionMode, type ConfirmedPoint } from '../../src/features/driver-publish/MapSelectionMode';

const DEPARTURE_PRESETS = [
  { label: 'Dans 15 min', minutes: 15 },
  { label: 'Dans 30 min', minutes: 30 },
  { label: 'Dans 1h', minutes: 60 },
  { label: 'Dans 2h', minutes: 120 },
];

// Mirrors (tabs)/explore.tsx's map section exactly (same ratio, same
// fallback region) — the Publish Explorer's normal state must read as the
// same product as Search's, not a second visual language.
const MAP_HEIGHT_RATIO = 0.35;
const TUNIS_REGION: MapRegion = {
  latitude: 36.8065,
  longitude: 10.1815,
  latitudeDelta: 0.045,
  longitudeDelta: 0.045,
};

type Step = 'form' | 'price' | 'review';

// Explicit journey-configuration vs. presentation state (Publish Explorer
// spec §18) — kept as two separate small state pieces rather than one
// combined enum: mapMode drives WHICH map-selection workspace is on screen
// (never destroys pickup/dropoff already confirmed), pickup/dropoff are the
// actual data. "Ready for price" is derived (`Boolean(pickup && dropoff)`),
// not stored, so it can never drift out of sync with the two points it
// depends on.
type MapMode = 'none' | 'pickup' | 'dropoff';

interface PublishPoint {
  label: string;
  lat: number;
  lng: number;
  /** The real route_stop id this resolves to, or null for a freehand pin —
   *  see MapSelectionMode's doc comment. */
  stopId: string | null;
}

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
  const { height: windowHeight } = useWindowDimensions();
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
  const [isGeneratingStops, setIsGeneratingStops] = useState(false);
  const [osrmUnavailable, setOsrmUnavailable] = useState(false);

  // Pickup/dropoff selection (Publish Explorer spec §5-11): mapMode drives
  // which full-map workspace (if any) is on screen; pickup/dropoff are the
  // driver's confirmed precise meeting points, independent of `origin`/
  // `destination` (the general searched place each was refined from).
  const [mapMode, setMapMode] = useState<MapMode>('none');
  const [pickup, setPickup] = useState<PublishPoint | null>(null);
  const [dropoff, setDropoff] = useState<PublishPoint | null>(null);
  // The origin/destination a real ride (rideId) was actually created
  // against — lets an origin/destination edit be detected and invalidate
  // exactly what depends on it (§17), without over-invalidating on every
  // unrelated re-render (departureAt/seats edits must NOT trigger this).
  const rideBuiltFromRef = useRef<{ originKey: string; destinationKey: string } | null>(null);
  // Review step (stitch/verification/publish-verification-requirement-prompt.html):
  // shown over the review screen when the driver isn't verified yet — the
  // ride is already saved as a draft by this point (createRide below).
  const [isVerificationPromptVisible, setIsVerificationPromptVisible] = useState(false);

  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const {
    data: driverProfile,
    isLoading: isProfileLoading,
    refetch: refetchDriverProfile,
  } = useGetMyDriverProfileQuery(undefined, { skip: !accessToken });
  const [createRide, { isLoading: isCreating }] = useCreateRideMutation();
  const [updateRide, { isLoading: isUpdatingPrice }] = useUpdateRideMutation();
  const [generateCandidateStops] = useGenerateCandidateStopsMutation();
  const [updateRideStops, { isLoading: isSavingStops }] = useUpdateRideStopsMutation();
  const [publishRide, { isLoading: isPublishingRide }] = usePublishRideMutation();
  const [registerPushToken] = useRegisterPushTokenMutation();
  const { requireAuth, isAuthSheetVisible, authTrigger, handleAuthenticated, cancelAuth } =
    useContextualAuth();

  useEffect(() => {
    dispatch(resetSearch());
    // Publishing starts with a clean slate — the rider search draft (if any)
    // shouldn't bleed into "where does my ride start/end".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Origin/destination invalidation (Publish Explorer spec §17): a real ride
  // can't have its origin/destination patched server-side (PATCH /rides
  // only ever accepted departureAt/seatsTotal/contributionPerSeat — see
  // rides.ts's updateRideSchema), so editing either field after the ride
  // was created means the ride, its route, and every one of its
  // route_stops (pickup and dropoff both point into that set) must all be
  // rebuilt from scratch — there is no "just re-attach the old dropoff"
  // option, its underlying route_stop row belonged to a ride that no
  // longer exists. Both points are therefore cleared on EITHER change, not
  // only the one the field visually corresponds to — the spec's per-field
  // wording describes the user-visible effect, not a claim that the other
  // point can safely survive a full ride recreation underneath it.
  // Compares against `rideBuiltFromRef` (set only when a ride is actually
  // created) rather than the previous render's origin/destination, so this
  // never fires on ordinary first-time form filling — only on a genuine
  // edit of an already-built ride's origin/destination.
  useEffect(() => {
    const builtFrom = rideBuiltFromRef.current;
    if (!builtFrom) return;
    const originChanged = !origin || `${origin.lat},${origin.lng}` !== builtFrom.originKey;
    const destinationChanged =
      !destination || `${destination.lat},${destination.lng}` !== builtFrom.destinationKey;
    if (!originChanged && !destinationChanged) return;

    rideBuiltFromRef.current = null;
    setRideId(null);
    setRidePolyline(null);
    setPricing(null);
    setCandidates([]);
    setMapMode('none');
    setPickup(null);
    setDropoff(null);
  }, [origin, destination]);

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
  // The persistent form-step background map's camera: fits the real route
  // once both precise points are confirmed, falls back to the general
  // origin/destination anchors before that (§13 — "camera fits the route
  // naturally... isn't excessively zoomed out").
  const journeyMapRegion = useMemo(() => {
    const points =
      routeCoordinates.length > 1
        ? routeCoordinates.map((c) => ({ lat: c.latitude, lng: c.longitude }))
        : [];
    if (pickup) points.push({ lat: pickup.lat, lng: pickup.lng });
    if (dropoff) points.push({ lat: dropoff.lat, lng: dropoff.lng });
    if (points.length === 0 && origin) points.push({ lat: origin.lat, lng: origin.lng });
    if (points.length === 0 && destination) points.push({ lat: destination.lat, lng: destination.lng });
    if (origin && !pickup) points.push({ lat: origin.lat, lng: origin.lng });
    if (destination && !dropoff) points.push({ lat: destination.lat, lng: destination.lng });
    return regionForPoints(points);
  }, [routeCoordinates, pickup, dropoff, origin, destination]);
  // Recommended points for each map-selection phase (§6/§10): the real,
  // road-snapped candidates nearest the relevant anchor, plus the anchor
  // itself — never fabricated. Recomputes live as `candidates` streams in
  // from the background generation call.
  const pickupRecommended = useMemo(
    () => (origin ? buildRecommendedPoints(origin, candidates) : []),
    [origin, candidates],
  );
  const dropoffRecommended = useMemo(
    () => (destination ? buildRecommendedPoints(destination, candidates) : []),
    [destination, candidates],
  );
  const readyForPrice = Boolean(pickup && dropoff);
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

  /** Creates the real server-side ride (route + candidate stops) and enters
   *  pickup-selection mode — the map-selection workspace needs a real route
   *  to source recommended points from (§6/§7), which only exists once a
   *  ride does. Safe to call again after a form-only edit (date/time/seats)
   *  without recreating anything — see the invalidation effect below, which
   *  is what actually clears `rideId` when origin/destination change. */
  async function createRideAndEnterPickup(vehicleId: string): Promise<void> {
    if (!origin || !destination) return;
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
        vehicleId,
        origin: { label: origin.label, lat: origin.lat, lng: origin.lng },
        destination: { label: destination.label, lat: destination.lat, lng: destination.lng },
        departureAt,
        seatsTotal: seats,
        // Phase 6 (docs/domain/pricing.md): price is deliberately omitted
        // here — the driver hasn't seen a route-derived bound yet, so
        // there's nothing meaningful to submit. The server computes the
        // route, derives {min, recommended, max}, and defaults
        // contributionPerSeat to `recommended`; the driver adjusts it on
        // the price step, once real bounds exist.
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
    rideBuiltFromRef.current = {
      originKey: `${origin.lat},${origin.lng}`,
      destinationKey: `${destination.lat},${destination.lng}`,
    };
    trackEvent('ride_price_suggested', {
      rideId: ride.id,
      min: ride.pricing.min,
      recommended: ride.pricing.recommended,
      max: ride.pricing.max,
      routeIsEstimate: ride.routeIsEstimate,
    });

    void generateStopsInBackground(ride.id);
    setMapMode('pickup');
  }

  /** The form step's "Suivant"/"Choisir le prix" — gated by requireAuth (a
   *  guest fills the form freely; sign-in only interrupts the tap itself).
   *  Always re-fetches the driver profile fresh rather than trusting
   *  `vehicle` from this render's closure: for a guest who just signed in
   *  via the contextual sheet, `driverProfile` was skip-gated (no token yet)
   *  at the time this render happened, so the stale closure would
   *  incorrectly read "no vehicle" even for an existing driver's account. */
  async function proceedFromForm(): Promise<void> {
    if (!origin || !destination) return;
    if (readyForPrice) {
      await goToPrice();
      return;
    }
    if (rideId) {
      // Already created against the current origin/destination (e.g. the
      // driver backed out of pickup selection and tapped "Suivant" again) —
      // re-enter the map workspace without recreating the ride.
      setMapMode('pickup');
      return;
    }
    const { data: freshProfile } = await refetchDriverProfile();
    const freshVehicle = freshProfile?.vehicles[0];
    if (freshVehicle) {
      await createRideAndEnterPickup(freshVehicle.id);
    } else {
      setStep('review');
    }
  }

  function confirmPickup(point: ConfirmedPoint): void {
    setPickup(point);
    trackEvent('ride_pickup_point_confirmed', { rideId: rideId ?? undefined, isCustom: point.stopId === null });
    setMapMode('dropoff');
  }

  function confirmDropoff(point: ConfirmedPoint): void {
    setDropoff(point);
    trackEvent('ride_dropoff_point_confirmed', { rideId: rideId ?? undefined, isCustom: point.stopId === null });
    setMapMode('none');
  }

  /** Persists whichever of pickup/dropoff resolved to a real route_stop via
   *  the existing driver-stop-selection endpoint — reused exactly as the
   *  old multi-select "stops" step used it, just with a selection of at
   *  most two ids instead of an arbitrary set. A freehand/custom pin (no
   *  `stopId`) has no route_stop row to mark selected — the ride's own
   *  origin/destination (already precise, from Places autocomplete) remains
   *  the meeting point for that end, same as before this pass. */
  async function savePickupDropoffStops(): Promise<boolean> {
    if (!rideId || candidates.length === 0) return true;
    const selectedIds = new Set(
      [pickup?.stopId, dropoff?.stopId].filter((id): id is string => Boolean(id)),
    );
    try {
      await updateRideStops({
        rideId,
        selections: buildStopSelectionPayload(candidates, selectedIds),
      }).unwrap();
      return true;
    } catch {
      haptics.error();
      setErrorMessage("Impossible d'enregistrer les points de rendez-vous. Réessayez.");
      return false;
    }
  }

  /** The normal Explorer's "Choisir le prix" CTA (§16) — only reachable once
   *  `readyForPrice`. Persists the pickup/dropoff selection, then enters the
   *  existing, unchanged price step. */
  async function goToPrice(): Promise<void> {
    const saved = await savePickupDropoffStops();
    if (!saved) return;
    setStep('price');
  }

  async function continueFromPriceToReview(): Promise<void> {
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

    setStep('review');
  }

  async function publishNow(): Promise<void> {
    if (!rideId) return;
    if (!pickup?.stopId && !dropoff?.stopId) {
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

    const saved = await savePickupDropoffStops();
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
    review: 'Vérifier et publier',
  };

  // Steps beyond the form move locally within this same tab screen (never a
  // route change), so "back" here means "previous wizard step" — there's
  // always somewhere to go for these two, unlike the form step itself
  // (see the removed router.back() history note below).
  function handleWizardBack(): void {
    if (step === 'review') setStep(vehicle ? 'price' : 'form');
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

  // §5-11: the map-selection workspace fully replaces the form-sheet
  // composition below while active — never a route change (this is still
  // the same (tabs)/publish screen, so the tab bar stays visible), just a
  // presentation swap. Confirming/backing out of either phase always
  // returns mapMode to 'none' or the other phase, never destroying
  // rideId/candidates/pickup/dropoff already gathered.
  if (mapMode !== 'none' && origin && destination) {
    const isPickupPhase = mapMode === 'pickup';
    return (
      <Animated.View style={[styles.container, stepMotionStyle]}>
        <MapSelectionMode
          theme={theme}
          scheme={scheme}
          anchor={isPickupPhase ? origin : destination}
          recommendedPoints={isPickupPhase ? pickupRecommended : dropoffRecommended}
          title={isPickupPhase ? 'Choisissez votre point de rendez-vous' : 'Choisissez votre point de dépose'}
          subtitle="Choisissez un point suggéré ou placez-le vous-même."
          confirmLabel={isPickupPhase ? 'Confirmer le point de rendez-vous' : 'Confirmer le point de dépose'}
          onConfirm={isPickupPhase ? confirmPickup : confirmDropoff}
          isLoadingRecommended={isGeneratingStops}
          recommendedUnavailable={!isGeneratingStops && osrmUnavailable}
          onBack={() => {
            if (isPickupPhase) {
              setMapMode('none');
            } else {
              setMapMode('pickup');
            }
          }}
        />
      </Animated.View>
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
            onPress={() => void continueFromPriceToReview()}
          />
        </View>
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
            <Text variant="headlineDisplay" color={theme.ink} style={styles.reviewTitle}>
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

                <TouchableOpacity
                  style={styles.timelineRow}
                  disabled={!hasRideData}
                  onPress={() => {
                    setStep('form');
                    setMapMode('pickup');
                  }}
                  accessibilityRole={hasRideData ? 'button' : undefined}
                  accessibilityLabel={hasRideData ? "Modifier le point de rendez-vous" : undefined}
                >
                  <View
                    style={[
                      styles.timelineDot,
                      { backgroundColor: theme.accent, borderColor: theme.surface },
                    ]}
                  />
                  <View style={styles.timelineRowContent}>
                    <View style={styles.timelineText}>
                      <Text variant="label" color={theme.ink} numberOfLines={2}>
                        {pickup?.label ?? origin?.label}
                      </Text>
                      <Text variant="bodySmall" color={theme.inkFaint}>
                        Point de rendez-vous
                      </Text>
                    </View>
                    <Text variant="bodySmall" color={theme.inkMuted} style={styles.timelineTime}>
                      {formatTime(departureAt)}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.timelineRow}
                  disabled={!hasRideData}
                  onPress={() => {
                    setStep('form');
                    setMapMode('dropoff');
                  }}
                  accessibilityRole={hasRideData ? 'button' : undefined}
                  accessibilityLabel={hasRideData ? 'Modifier le point de dépose' : undefined}
                >
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
                        {dropoff?.label ?? destination?.label}
                      </Text>
                      <Text variant="bodySmall" color={theme.inkFaint}>
                        Point de dépose
                      </Text>
                    </View>
                    {estimatedArrivalAt ? (
                      <Text variant="bodySmall" color={theme.inkMuted} style={styles.timelineTime}>
                        ~{formatTime(estimatedArrivalAt)}
                      </Text>
                    ) : null}
                  </View>
                </TouchableOpacity>
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
      {/* Mirrors (tabs)/explore.tsx's map section exactly: a fixed, non-
       *  interactive 35vh strip (never the full screen, never draggable —
       *  that gesture lives only in the dedicated MapSelectionMode
       *  workspace pickup/dropoff selection opens into), a dashed origin/
       *  destination preview before both are confirmed, the real road-route
       *  geometry once they are. */}
      <View style={[styles.mapSection, { height: windowHeight * MAP_HEIGHT_RATIO }]}>
        <MapView
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFillObject}
          region={journeyMapRegion ?? TUNIS_REGION}
          scrollEnabled={false}
          zoomEnabled={false}
          pitchEnabled={false}
          rotateEnabled={false}
          pointerEvents="none"
          customMapStyle={scheme === 'dark' ? darkMapStyle : lightMapStyle}
          userInterfaceStyle={scheme}
        >
          {routeCoordinates.length > 1 ? <MapRoute coordinates={routeCoordinates} showCorridor /> : null}
          {origin && destination && routeCoordinates.length <= 1 ? (
            <Polyline
              coordinates={[
                { latitude: origin.lat, longitude: origin.lng },
                { latitude: destination.lat, longitude: destination.lng },
              ]}
              strokeColor={theme.accent}
              strokeWidth={2}
              lineDashPattern={[6, 6]}
            />
          ) : null}
          {origin && !pickup ? (
            <Marker coordinate={{ latitude: origin.lat, longitude: origin.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.originDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
            </Marker>
          ) : null}
          {destination && !dropoff ? (
            <Marker coordinate={{ latitude: destination.lat, longitude: destination.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.destinationDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
            </Marker>
          ) : null}
          {pickup ? (
            <Marker coordinate={{ latitude: pickup.lat, longitude: pickup.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.originDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
            </Marker>
          ) : null}
          {dropoff ? (
            <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} anchor={{ x: 0.5, y: 0.5 }}>
              <View style={[styles.destinationDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
            </Marker>
          ) : null}
        </MapView>

        <StatusBarBlend theme={theme} scheme={scheme} height={insets.top - spacing.sm} />

        {/* Same dissolve-into-page fade explore.tsx uses, minus the "Vaya"
         *  wordmark (that's home-tab brand chrome, not part of the map+card
         *  structural pattern this screen is matching). */}
        <LinearGradient
          colors={[`${theme.background}00`, `${theme.background}8C`, `${theme.background}EB`, theme.background]}
          locations={[0, 0.45, 0.78, 1]}
          style={styles.mapFade}
        />
      </View>

      <View
        style={[
          styles.card,
          { backgroundColor: theme.surface, shadowColor: theme.ink, paddingBottom: insets.bottom + spacing.md },
        ]}
      >
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: theme.outlineVariant }]} />
        </View>

      <ScrollView style={styles.cardScroll} contentContainerStyle={styles.content}>
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
            label={readyForPrice ? 'Choisir le prix' : 'Suivant'}
            icon={readyForPrice ? 'pricetag-outline' : undefined}
            loading={isCreating}
            disabled={!canContinue}
            onPress={() => requireAuth(() => void proceedFromForm(), 'publishing')}
          />
        </Animated.View>
      </ScrollView>
      </View>

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

      <ContextualAuthSheet
        visible={isAuthSheetVisible}
        trigger={authTrigger}
        onClose={cancelAuth}
        onAuthenticated={handleAuthenticated}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  // Mirrors (tabs)/explore.tsx's mapSection/card/handle styles exactly —
  // same structural pattern, not a second visual language for Publish.
  mapSection: {
    position: 'relative',
    overflow: 'hidden',
  },
  mapFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 32,
  },
  card: {
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    flex: 1,
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.08,
    shadowRadius: 24,
    elevation: 8,
  },
  handle: {
    alignItems: 'center',
    paddingTop: spacing.sm,
  },
  handleBar: {
    width: 40,
    height: 4,
    borderRadius: 2,
  },
  cardScroll: {
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
