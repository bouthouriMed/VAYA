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
import MapView, { Marker, Polyline, PROVIDER_DEFAULT, type Region } from 'react-native-maps';
import Reanimated, { useSharedValue, useAnimatedStyle, withTiming, runOnJS } from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Text,
  MapRoute,
  PickupPin,
  DropoffPin,
  BottomSheet,
  DateCalendarSheet,
  TimeWheelSheet,
  PassengerSheet,
  GlassSurface,
  PriceRangeStepper,
  RouteOptionCard,
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
  type AppPalette,
  type MapRegion,
} from '@vaya/design-system';
import { router } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { formatTime, formatCurrency, formatDate, toIntlTag } from '../../src/utils/localeFormat';
import { resetSearch, swapOriginDestination } from '../../src/state/searchSlice';
import { setPendingRide, setPendingRideDraft } from '../../src/state/driverOnboardingSlice';
import { useContextualAuth } from '../../src/features/auth/useContextualAuth';
import { ContextualAuthSheet } from '../../src/features/auth/ContextualAuthSheet';
import {
  useGetMyDriverProfileQuery,
  useGetRouteOptionsMutation,
  useCreateRideMutation,
  useUpdateRideMutation,
  useGenerateCandidateStopsMutation,
  useUpdateRideStopsMutation,
  useAddCustomStopMutation,
  usePublishRideMutation,
  useRegisterPushTokenMutation,
  useLazyGeocodeReverseQuery,
  type RouteStop,
  type SuggestedPrice,
  type RouteOption,
} from '../../src/state/api';
import { decodePolyline } from '../../src/utils/polyline';
import { trackEvent } from '../../src/services/analytics/analytics';
import { requestPushPermissionAndRegister } from '../../src/services/notifications/registerForPushNotifications';
import { buildStopSelectionPayload } from '../../src/features/driver-publish/stopSelection';
import { resolveInitialPrice } from '../../src/features/driver-publish/priceSelection';
import { isVerifiedDriver } from '../../src/features/driver-publish/verificationGate';
import { buildRecommendedPoints, type RecommendedPoint } from '../../src/features/driver-publish/nearestStops';
import { CenterPin, RecommendedPointMarker } from '../../src/features/driver-publish/MapSelectionMode';

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
// The card's height while pickup/dropoff selection is active — just tall
// enough for its handle + confirm row + CTA (title/instructions moved to
// the map overlay, see the selection top bar below). The map takes
// everything above this, never the full screen — leaving zero room here
// was the bug that made the confirm bar invisible.
const SELECTION_CARD_HEIGHT = 168;

// 'route' is the route-selection step (world-class-carpooling-app UX:
// Google/Waze-style route picker) inserted between the origin/destination
// form and pickup/dropoff selection — only ever entered when there's a
// real choice to make (2+ genuinely distinct route alternatives); a route
// with only one real option skips straight past it, per the "without
// friction" principle this whole wizard already follows for zero-stop
// publishing.
type Step = 'form' | 'route' | 'price' | 'review';

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

function isSameCalendarDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** Locale-aware "Aujourd'hui"/"Demain"/short-date label for the Date param
 *  button — `@vaya/design-system`'s own `formatDepartureLabel` is hardcoded
 *  to `fr-FR` (out of this screen's scope to change), so the day portion is
 *  computed here instead, using `common:time.today`/`.tomorrow` and
 *  `utils/localeFormat.ts`'s real locale-aware `formatDate`. */
function formatDepartureDayLabel(
  date: Date,
  loc: SupportedLocale,
  todayLabel: string,
  tomorrowLabel: string,
  now: Date = new Date(),
): string {
  if (isSameCalendarDay(date, now)) return todayLabel;
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  if (isSameCalendarDay(date, tomorrow)) return tomorrowLabel;
  return formatDate(date, loc, { weekday: 'short', day: 'numeric', month: 'short' });
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
  const { t } = useTranslation('common');
  return (
    <View style={styles.headerRow}>
      <TouchableOpacity
        onPress={onBack}
        hitSlop={12}
        accessibilityRole="button"
        accessibilityLabel={t('actions.back')}
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
  const { t } = useTranslation(['driver', 'common']);
  const locale = (useAppSelector((s) => s.language.locale) || 'en') as SupportedLocale;
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  // Departure is a real date/time (any day, any half-hour slot) — defaults
  // to 30 minutes out, matching this form's old default even though the
  // quick-preset chips that used to set it explicitly are gone (Search's
  // own Date/Heure fields have no such presets either — see the Date/Heure
  // paramBtn row below, which mirrors explore.tsx's exactly).
  const [departureAt, setDepartureAt] = useState(() => new Date(Date.now() + 30 * 60_000));
  const departureDayLabel = formatDepartureDayLabel(
    departureAt,
    locale,
    t('common:time.today'),
    t('common:time.tomorrow'),
  );
  const [isDateSheetOpen, setIsDateSheetOpen] = useState(false);
  const [isTimeSheetOpen, setIsTimeSheetOpen] = useState(false);
  const [isSeatsSheetOpen, setIsSeatsSheetOpen] = useState(false);
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

  // Route-selection step: a small set of real, distinct route alternatives
  // (fastest/toll-avoiding/highway-avoiding/algorithmic-alternate) fetched
  // right after the form step, before the ride itself exists. `vehicleIdRef`
  // carries the vehicle id from the form step through to `continueFromRoute`
  // — kept as a ref (not state) since it's write-once-per-entry plumbing,
  // never itself rendered.
  const [routeOptions, setRouteOptions] = useState<RouteOption[]>([]);
  const [selectedRouteToken, setSelectedRouteToken] = useState<string | null>(null);
  const vehicleIdRef = useRef<string | null>(null);

  // Pickup/dropoff selection (Publish Explorer spec §5-11): mapMode drives
  // which full-map workspace (if any) is on screen; pickup/dropoff are the
  // driver's confirmed precise meeting points, independent of `origin`/
  // `destination` (the general searched place each was refined from).
  const [mapMode, setMapMode] = useState<MapMode>('none');
  const [pickup, setPickup] = useState<PublishPoint | null>(null);
  const [dropoff, setDropoff] = useState<PublishPoint | null>(null);

  // The map-expansion transformation itself (§5): one persistent MapView
  // that grows from the 35vh strip to fill the screen while the card
  // shrinks to a compact confirm bar — never a hard cut to a different
  // screen/component. Driven purely by `mapMode` (no pan gesture on the
  // sheet itself — that's what broke last time: a draggable sheet that
  // could get stuck collapsed). `mapAnim` 0 = collapsed, 1 = expanded.
  // Reanimated (UI-thread-driven), not RN core Animated — animating layout
  // height via the JS bridge on a view that hosts a native MapView is a
  // real iOS crash source (Apple Maps' own layout fighting bridge-driven
  // relayout every frame); Android tolerates it, iOS doesn't. Matches
  // BottomSheet.tsx's own proven Reanimated pattern.
  const mapAnim = useSharedValue(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const mapRef = useRef<MapView>(null);
  const isProgrammaticMapMove = useRef(false);
  const [selectedPointId, setSelectedPointId] = useState<string | null>('anchor');
  const [selectionCenter, setSelectionCenter] = useState<{ lat: number; lng: number } | null>(null);
  const [customPointLabel, setCustomPointLabel] = useState<string | null>(null);
  const [isDraggingPin, setIsDraggingPin] = useState(false);
  const [fetchReverseGeocode, { isFetching: isResolvingPointLabel }] = useLazyGeocodeReverseQuery();

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
  const [fetchRouteOptions, { isLoading: isLoadingRouteOptions }] = useGetRouteOptionsMutation();
  const [createRide, { isLoading: isCreating }] = useCreateRideMutation();
  const [updateRide, { isLoading: isUpdatingPrice }] = useUpdateRideMutation();
  const [generateCandidateStops] = useGenerateCandidateStopsMutation();
  const [updateRideStops, { isLoading: isSavingStops }] = useUpdateRideStopsMutation();
  const [addCustomStop] = useAddCustomStopMutation();
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
    setRouteOptions([]);
    setSelectedRouteToken(null);
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

  // Drives the map-expansion transformation itself (§5-11): entering
  // pickup/dropoff mode grows the map (mapAnim -> 1) while resetting the
  // selection to the phase's anchor and animating the camera to it once
  // the growth finishes; leaving it (mapMode 'none') shrinks the map back
  // to the 35vh strip. Height, not flex, is what's animated — flex can't be
  // interpolated, and animating a real height keeps the card (a flex:1
  // sibling) shrinking/growing in lockstep for free, with no separate
  // animation needed on the card itself.
  useEffect(() => {
    if (mapMode === 'none') {
      mapAnim.value = withTiming(0, { duration: 380 });
      return;
    }
    if (!activeAnchor) return;
    setSelectedPointId('anchor');
    setSelectionCenter({ lat: activeAnchor.lat, lng: activeAnchor.lng });
    setCustomPointLabel(null);
    const anchor = activeAnchor;
    mapAnim.value = withTiming(1, { duration: 380 }, (finished) => {
      'worklet';
      if (!finished) return;
      runOnJS(focusMapOn)(anchor);
    });
    // Only re-runs when the phase itself changes, not on every unrelated
    // re-render (activeAnchor is derived from origin/destination, which
    // are stable references between renders here).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode]);

  // `containerHeight` is this screen's own render area (already excludes
  // the tab bar, since onLayout measures the actual View inside the tab
  // navigator) — expanding "full height" must target that, not the raw
  // device window, or the map would overshoot past the tab bar. Falls back
  // to windowHeight only for the brief instant before the first onLayout.
  const effectiveHeight = containerHeight || windowHeight;
  const collapsedMapHeight = effectiveHeight * MAP_HEIGHT_RATIO;
  const expandedMapHeight = Math.max(effectiveHeight - SELECTION_CARD_HEIGHT, collapsedMapHeight);
  const mapSectionAnimatedStyle = useAnimatedStyle(() => ({
    height: collapsedMapHeight + (expandedMapHeight - collapsedMapHeight) * mapAnim.value,
  }));

  function focusMapOn(point: { lat: number; lng: number }): void {
    isProgrammaticMapMove.current = true;
    mapRef.current?.animateToRegion(
      { latitude: point.lat, longitude: point.lng, latitudeDelta: 0.01, longitudeDelta: 0.01 },
      350,
    );
  }

  function pickRecommendedPoint(point: RecommendedPoint): void {
    haptics.selection();
    setSelectedPointId(point.id);
    setSelectionCenter({ lat: point.lat, lng: point.lng });
    setCustomPointLabel(null);
    focusMapOn(point);
  }

  // `onRegionChange` (fires continuously during any region change, gesture
  // or programmatic) instead of `onPanDrag` — react-native-maps' onPanDrag
  // has a real history of being unreliable on iOS specifically, where its
  // native wiring can end up competing with MKMapView's own built-in pan
  // gesture recognizer and blocking user panning entirely. This callback
  // is only ever used for bookkeeping (lift the pin, drop the numbered-
  // marker selection) — the `isProgrammaticMapMove` guard already
  // distinguishes our own animateToRegion calls from a real user drag, so
  // switching events changes nothing about the logic, only which native
  // hook triggers it.
  function handleMapRegionChange(): void {
    if (mapMode === 'none' || isProgrammaticMapMove.current) return;
    if (!isDraggingPin) setIsDraggingPin(true);
    if (selectedPointId !== null) setSelectedPointId(null);
  }

  function handleMapRegionChangeComplete(region: Region): void {
    setIsDraggingPin(false);
    if (isProgrammaticMapMove.current) {
      isProgrammaticMapMove.current = false;
      return;
    }
    if (mapMode === 'none' || selectedPointId !== null) return;
    const next = { lat: region.latitude, lng: region.longitude };
    setSelectionCenter(next);
    void fetchReverseGeocode(next)
      .unwrap()
      .then((result) => setCustomPointLabel(result.label))
      .catch(() => setCustomPointLabel(t('driver:publish.stopsStep.customPosition')));
  }

  function confirmActivePoint(): void {
    if (!resolvedPointLabel || !selectionCenter) return;
    haptics.success();
    const point: PublishPoint = {
      label: resolvedPointLabel,
      lat: selectionCenter.lat,
      lng: selectionCenter.lng,
      stopId: selectedRecommendedPoint?.stopId ?? null,
    };
    if (mapMode === 'pickup') confirmPickup(point);
    else if (mapMode === 'dropoff') confirmDropoff(point);
  }

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
    if (points.length === 0 && destination)
      points.push({ lat: destination.lat, lng: destination.lng });
    if (origin && !pickup) points.push({ lat: origin.lat, lng: origin.lng });
    if (destination && !dropoff) points.push({ lat: destination.lat, lng: destination.lng });
    return regionForPoints(points);
  }, [routeCoordinates, pickup, dropoff, origin, destination]);

  // Camera control for the collapsed/preview state is imperative (ref +
  // animateToRegion), same as the pickup/dropoff phase's own camera moves
  // — never the declarative `region` prop. react-native-maps doesn't
  // reliably let go of control when a controlled `region` prop flips to
  // undefined (switching modes), which is what made the map ignore user
  // panning during selection: it kept snapping back toward the last
  // controlled value instead of following the drag.
  useEffect(() => {
    if (mapMode !== 'none' || !journeyMapRegion) return;
    isProgrammaticMapMove.current = true;
    mapRef.current?.animateToRegion(journeyMapRegion, 400);
  }, [journeyMapRegion, mapMode]);
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
  const activeAnchor = mapMode === 'pickup' ? origin : mapMode === 'dropoff' ? destination : null;
  const activeRecommended: RecommendedPoint[] =
    mapMode === 'pickup' ? pickupRecommended : mapMode === 'dropoff' ? dropoffRecommended : [];
  const selectedRecommendedPoint = activeRecommended.find((p) => p.id === selectedPointId) ?? null;
  const resolvedPointLabel = selectedRecommendedPoint?.label ?? customPointLabel;
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
   *  is what actually clears `rideId` when origin/destination change.
   *  `routeToken` (from the route-selection step, when it was shown) is
   *  redeemed server-side for the exact route the driver picked — see
   *  createRide's doc comment in rides.service.ts; omitted or expired falls
   *  back to the server's own default route, never blocking creation. */
  async function createRideAndEnterPickup(vehicleId: string, routeToken?: string): Promise<void> {
    if (!origin || !destination) return;
    setErrorMessage(undefined);
    // Route selection (if shown) is a step that precedes ride creation, not
    // one entered from it — returning here lands back on the base 'form'
    // render, where mapMode('pickup') below actually takes over the screen.
    setStep('form');

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
        routeToken,
        // Phase 6 (docs/domain/pricing.md): price is deliberately omitted
        // here — the driver hasn't seen a route-derived bound yet, so
        // there's nothing meaningful to submit. The server computes the
        // route, derives {min, recommended, max}, and defaults
        // contributionPerSeat to `recommended`; the driver adjusts it on
        // the price step, once real bounds exist.
      }).unwrap();
    } catch {
      haptics.error();
      setErrorMessage(t('driver:publish.errors.createFailed'));
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
    setRouteOptions([]);
    setSelectedRouteToken(null);
    setMapMode('pickup');
  }

  /** Route-selection step's entry point — fetches real route alternatives
   *  for the confirmed origin/destination. World-class-app judgment call,
   *  not a hardcoded rule: when there's nothing genuinely worth choosing
   *  between (a network hiccup, or a route with no meaningful alternative
   *  at all — the common case for a short in-town hop), this skips the
   *  step entirely and creates the ride against the recommended route
   *  directly, exactly as this wizard did before this feature existed —
   *  "without friction" means never showing a decision with only one real
   *  answer. */
  async function enterRouteSelection(vehicleId: string): Promise<void> {
    if (!origin || !destination) return;
    vehicleIdRef.current = vehicleId;

    try {
      const { options } = await fetchRouteOptions({
        origin: { lat: origin.lat, lng: origin.lng },
        destination: { lat: destination.lat, lng: destination.lng },
      }).unwrap();

      if (options.length <= 1) {
        await createRideAndEnterPickup(vehicleId, options[0]?.token);
        return;
      }

      setRouteOptions(options);
      setSelectedRouteToken(options.find((o) => o.recommended)?.token ?? options[0]!.token);
      trackEvent('ride_route_options_shown', { count: options.length });
      setStep('route');
    } catch {
      // Never block ride creation on the enhancement itself — degrade to
      // the exact pre-feature behavior (server picks the default route).
      await createRideAndEnterPickup(vehicleId);
    }
  }

  /** Route-selection step's "Continuer" — hands the picked token to ride
   *  creation, which redeems it server-side for the exact route computed
   *  moments earlier (rides.service.ts's createRide doc comment). */
  async function continueFromRoute(): Promise<void> {
    const vehicleId = vehicleIdRef.current;
    if (!vehicleId) return;
    trackEvent('ride_route_option_selected', {
      kind: routeOptions.find((o) => o.token === selectedRouteToken)?.kind ?? null,
    });
    await createRideAndEnterPickup(vehicleId, selectedRouteToken ?? undefined);
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
      await enterRouteSelection(freshVehicle.id);
    } else {
      setStep('review');
    }
  }

  function confirmPickup(point: PublishPoint): void {
    setPickup(point);
    trackEvent('ride_pickup_point_confirmed', {
      rideId: rideId ?? undefined,
      isCustom: point.stopId === null,
    });
    setMapMode('dropoff');
  }

  function confirmDropoff(point: PublishPoint): void {
    setDropoff(point);
    trackEvent('ride_dropoff_point_confirmed', {
      rideId: rideId ?? undefined,
      isCustom: point.stopId === null,
    });
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
    if (!rideId) return true;
    try {
      // A freehand pin (dragged off any recommended point) has no real
      // route_stop id yet — persist it now, before it's referenced by
      // anything else, so the passenger matching/booking flow and this
      // ride's own stop list see the real point the driver confirmed
      // instead of nothing at all. Local vars (not `pickup.stopId`/
      // `dropoff.stopId`) carry the freshly-created id forward within this
      // function — the `setPickup`/`setDropoff` calls below won't be
      // reflected in this render's closure until the next render.
      let pickupStopId = pickup?.stopId ?? null;
      let dropoffStopId = dropoff?.stopId ?? null;

      if (pickup && pickupStopId === null) {
        const inserted = await addCustomStop({
          rideId,
          label: pickup.label,
          lat: pickup.lat,
          lng: pickup.lng,
          role: 'pickup',
        }).unwrap();
        pickupStopId = inserted.id;
        setPickup({ label: inserted.label, lat: inserted.lat, lng: inserted.lng, stopId: inserted.id });
      }
      if (dropoff && dropoffStopId === null) {
        const inserted = await addCustomStop({
          rideId,
          label: dropoff.label,
          lat: dropoff.lat,
          lng: dropoff.lng,
          role: 'dropoff',
        }).unwrap();
        dropoffStopId = inserted.id;
        setDropoff({ label: inserted.label, lat: inserted.lat, lng: inserted.lng, stopId: inserted.id });
      }

      if (candidates.length > 0) {
        const selectedIds = new Set(
          [pickupStopId, dropoffStopId].filter((id): id is string => Boolean(id)),
        );
        await updateRideStops({
          rideId,
          selections: buildStopSelectionPayload(candidates, selectedIds),
        }).unwrap();
      }
      return true;
    } catch {
      haptics.error();
      setErrorMessage(t('driver:publish.errors.stopsFailed'));
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
        setErrorMessage(t('driver:publish.errors.priceFailed'));
        return;
      }
    }

    setStep('review');
  }

  // Publishing leaves this whole local state stack behind for the driver's
  // NEXT ride — the tab screen stays mounted (Expo Router keeps tab
  // screens alive), so without this a driver returning to Publier saw the
  // just-published ride's review screen instead of a clean form. Mirrors
  // the origin/destination-change invalidation effect's reset, plus
  // everything that effect doesn't touch (step/seats/departureAt/etc).
  function resetWizard(): void {
    dispatch(resetSearch());
    setDepartureAt(new Date(Date.now() + 30 * 60_000));
    setSeats(3);
    setErrorMessage(undefined);
    setStep('form');
    setRideId(null);
    setRidePolyline(null);
    setPricing(null);
    setRouteIsEstimate(false);
    setEstimatedDurationSec(null);
    setPrice(0);
    setCandidates([]);
    setIsGeneratingStops(false);
    setOsrmUnavailable(false);
    setRouteOptions([]);
    setSelectedRouteToken(null);
    vehicleIdRef.current = null;
    setMapMode('none');
    setPickup(null);
    setDropoff(null);
    setSelectedPointId('anchor');
    setSelectionCenter(null);
    setCustomPointLabel(null);
    setIsDraggingPin(false);
    setIsVerificationPromptVisible(false);
    rideBuiltFromRef.current = null;
    mapAnim.value = 0;
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
      resetWizard();
      router.replace('/(tabs)/trips');
    } catch {
      haptics.error();
      setErrorMessage(t('driver:publish.errors.publishFailed'));
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
    route: t('driver:publish.steps.route'),
    price: t('driver:publish.steps.price'),
    review: t('driver:publish.steps.review'),
  };

  // Steps beyond the form move locally within this same tab screen (never a
  // route change), so "back" here means "previous wizard step" — there's
  // always somewhere to go for these two, unlike the form step itself
  // (see the removed router.back() history note below).
  function handleWizardBack(): void {
    if (step === 'review') setStep(vehicle ? 'price' : 'form');
    else if (step === 'price') setStep('form');
    else if (step === 'route') setStep('form');
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

  if (step === 'route') {
    const decodedByToken = new Map(
      routeOptions.map((o) => [o.token, decodePolyline(o.polyline)] as const),
    );
    const allPoints = routeOptions.flatMap(
      (o) => decodedByToken.get(o.token)?.map((c) => ({ lat: c.latitude, lng: c.longitude })) ?? [],
    );
    const routeOptionsRegion = regionForPoints(allPoints) ?? TUNIS_REGION;

    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <StepHeader theme={theme} title={stepTitles.route} onBack={handleWizardBack} />
        </View>

        <View style={styles.routeMapSection}>
          <MapView
            style={StyleSheet.absoluteFillObject}
            provider={PROVIDER_DEFAULT}
            customMapStyle={scheme === 'dark' ? darkMapStyle : lightMapStyle}
            initialRegion={routeOptionsRegion}
          >
            {/* A single stable-order pass, never two filtered/reordered
                lists — on iOS, react-native-maps crashes when a MapView's
                overlay children change POSITION between renders (not just
                count), which is exactly what splitting into "unselected"/
                "selected" arrays did every time selectedRouteToken changed.
                Selection is now expressed purely via color/width/corridor
                props on an unmoving set of nodes. */}
            {routeOptions.map((option) => {
              const isSelected = option.token === selectedRouteToken;
              return (
                <MapRoute
                  key={option.token}
                  coordinates={decodedByToken.get(option.token) ?? []}
                  color={isSelected ? theme.accent : theme.inkFaint}
                  width={isSelected ? 5 : 3}
                  showCorridor={isSelected}
                />
              );
            })}
          </MapView>
        </View>

        <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.routeSheet}>
          <ScrollView contentContainerStyle={styles.routeList} showsVerticalScrollIndicator={false}>
            <Text variant="label" color={theme.inkFaint} style={styles.eyebrow}>
              {t('driver:publish.routeStep.availableCount', { count: routeOptions.length })}
            </Text>
            {routeOptions.map((option) => (
              <RouteOptionCard
                key={option.token}
                option={option}
                selected={option.token === selectedRouteToken}
                onPress={() => setSelectedRouteToken(option.token)}
                theme={theme}
                tollsLabel={t('driver:publish.routeStep.tollsLabel')}
                noTollsLabel={t('driver:publish.routeStep.noTollsLabel')}
                estimateLabel={t('driver:publish.routeStep.estimateLabel')}
                recommendedLabel={t('driver:publish.routeStep.recommendedLabel')}
              />
            ))}
          </ScrollView>
        </GlassSurface>

        {errorMessage ? (
          <Text variant="bodySmall" color={theme.error} align="center">
            {errorMessage}
          </Text>
        ) : null}

        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
          <PrimaryButton
            theme={theme}
            label={t('common:actions.continue')}
            loading={isCreating}
            disabled={!selectedRouteToken}
            onPress={() => void continueFromRoute()}
          />
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
            {t('driver:publish.priceStep.title')}
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
                label={t('driver:publish.priceStep.contributionLabel')}
              />
            ) : null}
          </GlassSurface>
          <Text variant="bodySmall" color={theme.inkFaint} align="center" style={styles.hint}>
            {t('driver:publish.priceStep.description')}
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
            label={t('common:actions.continue')}
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
              {t('driver:publish.reviewStep.readyToPublish')}
            </Text>
            <Text variant="body" color={theme.inkMuted} style={styles.reviewSubtitle}>
              {t('driver:publish.reviewStep.checkDetails')}
            </Text>

            <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.reviewCard}>
              <View style={styles.reviewCardHeader}>
                <Text variant="label" color={theme.inkFaint} style={styles.reviewCardEyebrow}>
                  {t('driver:publish.reviewStep.itinerary')}
                </Text>
                <TouchableOpacity
                  style={styles.reviewEditBtn}
                  onPress={() => setStep('form')}
                  accessibilityRole="button"
                  accessibilityLabel={t('driver:publish.reviewStep.editItinerary')}
                >
                  <Text variant="bodySmall" color={theme.inkMuted}>
                    {t('driver:publish.reviewStep.modify')}
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
                  accessibilityLabel={hasRideData ? t('driver:publish.stopsStep.editPickup') : undefined}
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
                        {t('driver:publish.reviewStep.meetingPoint')}
                      </Text>
                    </View>
                    <Text variant="bodySmall" color={theme.inkMuted} style={styles.timelineTime}>
                      {formatTime(departureAt, locale)}
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
                  accessibilityLabel={hasRideData ? t('driver:publish.stopsStep.editDropoff') : undefined}
                >
                  <View
                    style={[
                      styles.timelineDot,
                      styles.timelineDotDestination,
                      { backgroundColor: theme.surface, borderColor: theme.ink },
                    ]}
                  >
                    <View
                      style={[styles.timelineDotDestinationInner, { backgroundColor: theme.ink }]}
                    />
                  </View>
                  <View style={styles.timelineRowContent}>
                    <View style={styles.timelineText}>
                      <Text variant="label" color={theme.ink} numberOfLines={2}>
                        {dropoff?.label ?? destination?.label}
                      </Text>
                      <Text variant="bodySmall" color={theme.inkFaint}>
                        {t('driver:publish.stopsStep.dropoffTitle')}
                      </Text>
                    </View>
                    {estimatedArrivalAt ? (
                      <Text variant="bodySmall" color={theme.inkMuted} style={styles.timelineTime}>
                        {t('driver:publish.reviewStep.estimatedArrival', {
                          time: formatTime(estimatedArrivalAt, locale),
                        })}
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
                    {t('driver:publish.reviewStep.price')}
                  </Text>
                  {hasRideData ? (
                    <TouchableOpacity
                      onPress={() => setStep('price')}
                      accessibilityRole="button"
                      accessibilityLabel={t('driver:publish.reviewStep.editPrice')}
                    >
                      <Icon name="pencil-outline" size="xs" color={theme.inkMuted} />
                    </TouchableOpacity>
                  ) : null}
                </View>
                {hasRideData ? (
                  <View style={styles.reviewStatRow}>
                    <Text variant="h2" color={theme.ink}>
                      {formatCurrency(price, locale)}
                    </Text>
                  </View>
                ) : (
                  <View style={styles.lockedRow}>
                    <Icon name="lock-closed-outline" size="xs" color={colors.warningDark} />
                    <Text variant="bodySmall" color={colors.warningDark}>
                      {t('driver:publish.reviewStep.afterVerification')}
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
                    {t('driver:publish.reviewStep.seatsAvailable')}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setStep('form')}
                    accessibilityRole="button"
                    accessibilityLabel={t('driver:publish.reviewStep.editSeats')}
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
                  {t('driver:publish.reviewStep.vehicle')}
                </Text>
                <View style={styles.vehicleSummaryRow}>
                  <View
                    style={[styles.vehicleSummaryIcon, { backgroundColor: theme.surfaceMuted }]}
                  >
                    <Icon name="car-sport-outline" size="md" color={theme.ink} />
                  </View>
                  <View>
                    <Text variant="label" color={theme.ink}>
                      {vehicle.make} {vehicle.model} · {vehicle.color}
                    </Text>
                    <Text variant="bodySmall" color={theme.inkMuted}>
                      {vehicle.plateNumber} ·{' '}
                      {t('driver:publish.reviewStep.totalSeats', { count: vehicle.seatCount })}
                    </Text>
                  </View>
                </View>
              </GlassSurface>
            ) : (
              <GlassSurface theme={theme} scheme={scheme} radius="2xl" style={styles.reviewCard}>
                <Text variant="label" color={theme.inkFaint} style={styles.reviewCardEyebrow}>
                  {t('driver:publish.reviewStep.vehicle')}
                </Text>
                <View style={styles.vehicleSummaryRow}>
                  <View
                    style={[styles.vehicleSummaryIcon, { backgroundColor: theme.surfaceMuted }]}
                  >
                    <Icon name="lock-closed-outline" size="sm" color={theme.inkFaint} />
                  </View>
                  <Text
                    variant="bodySmall"
                    color={theme.inkMuted}
                    style={styles.vehiclePendingText}
                  >
                    {t('driver:publish.reviewStep.addAfterVerify')}
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
            label={
              hasRideData
                ? t('driver:publish.reviewStep.publishCta')
                : t('driver:publish.reviewStep.verifyCta')
            }
            icon={hasRideData ? 'rocket-outline' : 'shield-checkmark-outline'}
            loading={isPublishing}
            disabled={isPublishing}
            onPress={() => void finalizePublish()}
          />
          <Text variant="bodySmall" color={theme.inkFaint} align="center" style={styles.termsHint}>
            {hasRideData
              ? t('driver:publish.reviewStep.termsHint')
              : t('driver:publish.reviewStep.verifyDescription')}
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
              {t('driver:publish.verificationSheet.title')}
            </Text>
            <Text variant="body" color={theme.inkMuted} align="center">
              {t('driver:publish.verificationSheet.description')}
            </Text>
            <View style={styles.verificationPill}>
              <Icon name="hourglass-outline" size="xs" color={colors.warningDark} />
              <Text variant="bodySmall" color={colors.warningDark}>
                {t('driver:publish.verificationSheet.pillLabel')}
              </Text>
            </View>
            <PrimaryButton
              theme={theme}
              label={t('driver:publish.verificationSheet.startCta')}
              onPress={startVerification}
            />
            <GhostButton
              theme={theme}
              label={t('common:actions.later')}
              onPress={() => setIsVerificationPromptVisible(false)}
            />
          </View>
        </BottomSheet>
      </View>
    );
  }

  const isMapExpanded = mapMode !== 'none';

  return (
    <View
      style={[styles.container, { backgroundColor: theme.background }]}
      onLayout={(e) => setContainerHeight(e.nativeEvent.layout.height)}
    >
      {/* One persistent map (§5): it GROWS from explore.tsx's fixed 35vh
       *  strip to fill the screen when pickup/dropoff selection opens, and
       *  shrinks back when it closes — never a hard cut to a different
       *  component/screen. Interactive (scroll/zoom/pan) only while a
       *  selection phase is active; a static, non-interactive preview the
       *  rest of the time, exactly like explore.tsx's map. */}
      <Reanimated.View style={[styles.mapSection, mapSectionAnimatedStyle]}>
        <MapView
          ref={mapRef}
          provider={PROVIDER_DEFAULT}
          style={StyleSheet.absoluteFillObject}
          initialRegion={journeyMapRegion ?? TUNIS_REGION}
          scrollEnabled={isMapExpanded}
          zoomEnabled={isMapExpanded}
          pitchEnabled={false}
          rotateEnabled={false}
          onRegionChange={handleMapRegionChange}
          onRegionChangeComplete={handleMapRegionChangeComplete}
          customMapStyle={scheme === 'dark' ? darkMapStyle : lightMapStyle}
          userInterfaceStyle={scheme}
        >
          {isMapExpanded ? (
            activeRecommended.map((point, index) => (
              <RecommendedPointMarker
                key={point.id}
                point={point}
                index={index}
                isSelected={point.id === selectedPointId}
                theme={theme}
                onPress={() => pickRecommendedPoint(point)}
              />
            ))
          ) : (
            <>
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
                  <PickupPin theme={theme} />
                </Marker>
              ) : null}
              {dropoff ? (
                <Marker coordinate={{ latitude: dropoff.lat, longitude: dropoff.lng }} anchor={{ x: 0.5, y: 0.5 }}>
                  <DropoffPin theme={theme} />
                </Marker>
              ) : null}
            </>
          )}
        </MapView>

        {isMapExpanded ? <CenterPin theme={theme} isDragging={isDraggingPin} /> : null}

        <StatusBarBlend theme={theme} scheme={scheme} height={insets.top - spacing.sm} />

        {isMapExpanded ? (
          // World-class-map-app convention (Google Maps/Uber's own pin-drop
          // screens): a small back button + a short, glanceable instruction
          // pill sit ON the map near the top, right where the user is
          // already looking while they drag — not buried in the card below,
          // which is reserved for the confirm action alone.
          <View style={[styles.selectionTopBar, { paddingTop: insets.top + spacing.sm }]} pointerEvents="box-none">
            <TouchableOpacity
              onPress={() => setMapMode(mapMode === 'dropoff' ? 'pickup' : 'none')}
              hitSlop={12}
              style={[styles.roundBtn, { backgroundColor: theme.surface, shadowColor: theme.ink }]}
              accessibilityRole="button"
              accessibilityLabel={t('common:actions.back')}
            >
              <Icon name="arrow-back" size="sm" color={theme.ink} />
            </TouchableOpacity>
            <GlassSurface theme={theme} scheme={scheme} radius="lg" style={styles.selectionInstructionCard}>
              <Text variant="label" color={theme.ink}>
                {mapMode === 'pickup'
                  ? t('driver:publish.stopsStep.pickupTitle')
                  : t('driver:publish.stopsStep.dropoffTitle')}
              </Text>
              <Text variant="caption" color={theme.inkMuted}>
                {isGeneratingStops
                  ? t('driver:publish.stopsStep.searching')
                  : osrmUnavailable
                    ? t('driver:publish.stopsStep.unavailable')
                    : t('driver:publish.stopsStep.chooseOrPlace')}
              </Text>
            </GlassSurface>
          </View>
        ) : null}

        {isMapExpanded ? null : (
          // Same dissolve-into-page fade explore.tsx uses, minus the "Vaya"
          // wordmark (that's home-tab brand chrome, not part of the map+
          // card structural pattern this screen is matching). Hidden while
          // expanded so it never washes out the interactive map/pins.
          <LinearGradient
            colors={[`${theme.background}00`, `${theme.background}8C`, `${theme.background}EB`, theme.background]}
            locations={[0, 0.45, 0.78, 1]}
            style={styles.mapFade}
          />
        )}
      </Reanimated.View>

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.surface,
            shadowColor: theme.ink,
            paddingBottom: insets.bottom + spacing.md,
          },
        ]}
      >
        <View style={styles.handle}>
          <View style={[styles.handleBar, { backgroundColor: theme.outlineVariant }]} />
        </View>

      {isMapExpanded ? (
        <View style={styles.selectionCardContent}>
          <View style={[styles.selectionConfirmRow, { borderColor: theme.outlineVariant }]}>
            <View style={[styles.confirmIcon, { backgroundColor: theme.surfaceMuted }]}>
              {isResolvingPointLabel ? (
                <ActivityIndicator size="small" color={theme.ink} />
              ) : (
                <Icon name="pin" size="sm" color={theme.ink} />
              )}
            </View>
            <View style={styles.confirmTextCol}>
              <Text variant="caption" color={theme.inkFaint}>
                {t('driver:publish.stopsStep.selectedPoint')}
              </Text>
              <Text variant="label" color={theme.ink} numberOfLines={1}>
                {isResolvingPointLabel
                  ? t('driver:publish.stopsStep.resolvingLabel')
                  : (resolvedPointLabel ?? t('driver:publish.stopsStep.moveMap'))}
              </Text>
            </View>
          </View>

          <PrimaryButton
            theme={theme}
            label={
              mapMode === 'pickup'
                ? t('driver:publish.stopsStep.confirmPickup')
                : t('driver:publish.stopsStep.confirmDropoff')
            }
            onPress={confirmActivePoint}
            disabled={!resolvedPointLabel || isResolvingPointLabel}
          />
        </View>
      ) : (
      <ScrollView style={styles.cardScroll} contentContainerStyle={styles.content}>
        <Animated.View style={[styles.formStack, stepMotionStyle]}>
          <Text variant="headlineDisplay" color={theme.ink} style={styles.headline}>
            {t('driver:publish.formStep.headline')}
          </Text>

          {/* Exact copy of (tabs)/explore.tsx's locationBlock — same
           *  bordered plain surface, dashed connector, icon-circle
           *  treatment and swap button, not the translucent GlassSurface
           *  card this used before. Only the copy below (headline/CTA)
           *  differs between Search and Publish. */}
          <View
            style={[
              styles.locationBlock,
              { backgroundColor: theme.surface, borderColor: theme.outlineVariant, shadowColor: theme.ink },
            ]}
          >
            <View pointerEvents="none" style={styles.connectorCol}>
              <View style={[styles.connectorLine, { borderColor: theme.outlineVariant }]} />
            </View>

            <TouchableOpacity
              style={styles.locationRow}
              onPress={() =>
                router.push({ pathname: '/search/composer', params: { field: 'origin' } })
              }
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('common:terms.departure')}, ${origin?.label ?? t('common:terms.departurePoint')}`}
            >
              <View style={[styles.locationIconWrap, { backgroundColor: theme.accentGlow + '33' }]}>
                <Icon name="locate" size="sm" color={theme.accent} />
              </View>
              <View style={styles.locationTextCol}>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.departure')}
                </Text>
                <Text variant="body" numberOfLines={1} color={origin ? theme.ink : theme.inkFaint}>
                  {origin?.label ?? t('common:terms.departurePoint')}
                </Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.locationRow}
              onPress={() =>
                router.push({ pathname: '/search/composer', params: { field: 'destination' } })
              }
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('common:terms.arrival')}, ${destination?.label ?? t('common:terms.whereTo')}`}
            >
              <View style={[styles.locationIconWrap, { backgroundColor: theme.surfaceMuted }]}>
                <Icon name="location" size="sm" color={theme.inkMuted} />
              </View>
              <View style={styles.locationTextCol}>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.arrival')}
                </Text>
                <Text variant="body" numberOfLines={1} color={destination ? theme.ink : theme.inkFaint}>
                  {destination?.label ?? t('common:terms.whereTo')}
                </Text>
              </View>
            </TouchableOpacity>

            {origin && destination ? (
              <TouchableOpacity
                style={[styles.swapBtn, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}
                onPress={() => dispatch(swapOriginDestination())}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel={t('common:actions.swap')}
              >
                <Icon name="swap-vertical" size="sm" color={theme.inkMuted} />
              </TouchableOpacity>
            ) : null}
          </View>

          <View style={styles.paramsGrid}>
            <TouchableOpacity
              style={[styles.paramBtn, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
              onPress={() => setIsDateSheetOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('driver:publish.formStep.dateLabel')}, ${departureDayLabel}, ${formatTime(departureAt, locale)}`}
            >
              <Icon name="calendar-outline" size="sm" color={theme.inkFaint} />
              <View>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.date')}
                </Text>
                <Text variant="bodySmall" color={theme.ink}>
                  {departureDayLabel}
                </Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.paramBtn, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
              onPress={() => setIsTimeSheetOpen(true)}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel={`${t('driver:publish.formStep.timeLabel')}, ${formatTime(departureAt, locale)}`}
            >
              <Icon name="time-outline" size="sm" color={theme.inkFaint} />
              <View>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.time')}
                </Text>
                <Text variant="bodySmall" color={theme.ink}>
                  {formatTime(departureAt, locale)}
                </Text>
              </View>
            </TouchableOpacity>
          </View>

          {/* Same tap-to-open sheet grammar as Date/Heure and as Search's
           *  own Passagers row — no inline counter/stepper on the form
           *  itself, the count is edited in the sheet only. */}
          <TouchableOpacity
            style={[styles.paramBtnWide, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
            onPress={() => setIsSeatsSheetOpen(true)}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={`${t('driver:publish.formStep.seatsLabel')}, ${t('common:terms.seat', { count: seats })}`}
          >
            <View style={[styles.seatsIconWrap, { backgroundColor: theme.surfaceMuted }]}>
              <Icon name="person-outline" size="sm" color={theme.inkFaint} />
            </View>
            <View>
              <Text variant="caption" color={theme.inkFaint}>
                {t('driver:publish.formStep.seatsLabel')}
              </Text>
              <Text variant="bodySmall" color={theme.ink}>
                {t('common:terms.seat', { count: seats })}
              </Text>
            </View>
          </TouchableOpacity>

            {errorMessage ? (
              <Text variant="bodySmall" color={theme.error} style={styles.formError}>
                {errorMessage}
              </Text>
            ) : null}

          <PrimaryButton
            theme={theme}
            label={readyForPrice ? t('driver:publish.formStep.choosePriceCta') : t('common:actions.next')}
            icon={readyForPrice ? 'pricetag-outline' : undefined}
            loading={isCreating || isLoadingRouteOptions}
            disabled={!canContinue}
            onPress={() => requireAuth(() => void proceedFromForm(), 'publishing')}
          />
        </Animated.View>
      </ScrollView>
      )}
      </View>

      <DateCalendarSheet
        visible={isDateSheetOpen}
        onClose={() => setIsDateSheetOpen(false)}
        value={departureAt}
        onChange={setDepartureAt}
        title={t('driver:publish.formStep.dateLabel')}
        locale={toIntlTag(locale)}
        weekdayLabels={
          t('driver:publish.formStep.weekdayLabels', { returnObjects: true }) as [
            string, string, string, string, string, string, string,
          ]
        }
        closeLabel={t('common:actions.close')}
        previousMonthLabel={t('driver:publish.formStep.previousMonth')}
        nextMonthLabel={t('driver:publish.formStep.nextMonth')}
        confirmLabel={t('driver:publish.formStep.confirmDate')}
      />
      <TimeWheelSheet
        visible={isTimeSheetOpen}
        onClose={() => setIsTimeSheetOpen(false)}
        value={departureAt}
        onChange={setDepartureAt}
        title={t('driver:publish.formStep.timeLabel')}
        closeLabel={t('common:actions.close')}
        subtitleLabel={t('driver:publish.formStep.timeSheetSubtitle')}
        summaryLabel={(time) => t('driver:publish.formStep.timeSheetSummary', { time })}
        confirmLabel={t('common:actions.confirm')}
      />
      <PassengerSheet
        visible={isSeatsSheetOpen}
        onClose={() => setIsSeatsSheetOpen(false)}
        value={seats}
        onChange={setSeats}
        min={1}
        max={8}
        title={t('driver:publish.formStep.seatsLabel')}
        formatCount={(n) => t('driver:publish.formStep.seatsCount', { count: n })}
        hint={t('driver:publish.formStep.seatsHint', { count: 8 })}
        closeLabel={t('common:actions.close')}
        incrementLabel={t('driver:publish.formStep.incrementSeat')}
        decrementLabel={t('driver:publish.formStep.decrementSeat')}
        confirmLabel={t('common:actions.confirm')}
        confirmAriaLabel={(countLabel) => `${t('common:actions.confirm')} ${countLabel}`}
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
  // The pickup/dropoff phase's own top overlay — back button + a short
  // instruction pill, both riding on the map itself (§7: guidance belongs
  // near where the user is already looking, not buried in the card).
  selectionTopBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
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
  selectionInstructionCard: {
    flex: 1,
    padding: spacing.md,
    gap: 2,
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
  // The compact confirm bar shown in the card while pickup/dropoff
  // selection is active — deliberately small (§8: "a compact confirmation
  // control that does not unnecessarily obstruct the map"), since the map
  // above it has just grown to fill nearly the whole screen.
  selectionCardContent: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  selectionConfirmRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderWidth: 1,
    borderRadius: radii.lg,
    padding: spacing.sm,
  },
  confirmIcon: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmTextCol: {
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
  // Matches (tabs)/explore.tsx's headline style exactly — centered, no
  // extra top margin (the formStack's own gap already spaces it from the
  // handle above).
  headline: {
    marginTop: 0,
    textAlign: 'center',
  },
  eyebrow: {
    fontWeight: typography.fontWeight.semibold,
    letterSpacing: 1.5,
    marginBottom: spacing.xs,
    marginTop: spacing.sm,
  },
  // Exact copy of explore.tsx's locationBlock/connectorCol/connectorLine/
  // locationRow/locationIconWrap/locationTextCol/swapBtn — same values,
  // same names, so a future Search style change is easy to notice should
  // stay in sync here too.
  locationBlock: {
    position: 'relative',
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.md,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 18,
    elevation: 3,
  },
  connectorCol: {
    position: 'absolute',
    left: spacing.md + 15,
    top: spacing.md + 40,
    bottom: spacing.md + 8,
    width: 2,
  },
  connectorLine: {
    flex: 1,
    width: 0,
    borderLeftWidth: 2,
    borderStyle: 'dashed',
  },
  locationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  locationIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationTextCol: {
    flex: 1,
    gap: 1,
  },
  swapBtn: {
    position: 'absolute',
    right: spacing.md,
    top: '50%',
    marginTop: -19,
    width: 38,
    height: 38,
    borderRadius: 19,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formError: {
    marginBottom: spacing.xs,
  },
  // Matches explore.tsx's paramsGrid/paramBtn/paramBtnWide exactly (§14.1
  // guidance above) — Date/Heure sit side by side, Places disponibles is a
  // full-width row beneath, none of them wrapped in a second card.
  paramsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
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
  paramBtnWide: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  seatsIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
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
  // Route-selection step: a persistent map (all alternatives drawn at
  // once, Google/Waze-picker style) filling the space between the header
  // and the option-list sheet below it.
  routeMapSection: {
    flex: 1,
    position: 'relative',
  },
  routeSheet: {
    maxHeight: '48%',
    marginHorizontal: spacing.lg,
    marginTop: spacing.sm,
  },
  routeList: {
    padding: spacing.md,
    gap: spacing.sm,
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
