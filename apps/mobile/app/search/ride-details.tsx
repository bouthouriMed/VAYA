import { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Marker } from 'react-native-maps';
import { skipToken } from '@reduxjs/toolkit/query/react';
import { useTranslation } from 'react-i18next';
import {
  Text,
  Icon,
  Avatar,
  MapCanvas,
  PickupPin,
  DropoffPin,
  useAppTheme,
  spacing,
  radii,
  haptics,
  isSameDay,
  regionForPoints,
  addDays,
  ScreenHeader,
  HeaderIconButton,
  StateView,
  Button,
  RouteLine,
  elevation,
  useToast,
} from '@vaya/design-system';
import { router, useLocalSearchParams } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import {
  useGetRideQuery,
  useGetUserPublicProfileQuery,
  useGetRideStopsQuery,
  useMatchingSearchQuery,
  useListFellowPassengersQuery,
  useCreateBookingMutation,
  useRegisterPushTokenMutation,
  useGetMeQuery,
  useListMyBookingsQuery,
} from '../../src/state/api';
import { useAppDispatch, useAppSelector } from '../../src/state/store';
import { clearSelectedStops } from '../../src/state/searchSlice';
import { requestPushPermissionAndRegister } from '../../src/services/notifications/registerForPushNotifications';
import { decodePolyline, polylineDistanceKm, sliceRouteBetween } from '../../src/utils/polyline';
import { useContextualAuth } from '../../src/features/auth/useContextualAuth';
import { ContextualAuthSheet } from '../../src/features/auth/ContextualAuthSheet';
import { ContactPhoneSheet } from '../../src/features/contact-phone/ContactPhoneSheet';
import { useContactPhonePrompt } from '../../src/features/contact-phone/useContactPhonePrompt';
import { formatCurrency, formatDate, formatTime } from '../../src/utils/localeFormat';
import { fullPlaceLabel, shortenPlaceLabel } from '../../src/utils/placeLabel';
import { openDirections } from '../../src/utils/openInMaps';
import { accessAmount } from '../../src/features/search/passengerAccess';
import { formatDurationLabel } from '../../src/utils/durationLabel';
import { resolvePassengerSegmentPoints } from '../../src/features/search/passengerSegment';
import type { TFunction } from 'i18next';

type TFn = (key: string, params?: Record<string, unknown>) => string;

function fullDateLabel(date: Date, locale: SupportedLocale): string {
  const label = formatDate(date, locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function durationLabel(seconds: number, t: TFn): string {
  return formatDurationLabel(t as unknown as TFunction, seconds / 60);
}

/** Maps createBooking's real rejection reason to an honest i18n key —
 *  every rejection used to render as "this seat was just taken" regardless
 *  of cause, which actively misled testers hitting the self-booking or
 *  duplicate-request guards (bookings.service.ts) into thinking the ride
 *  had sold out. Falls back to the seat-taken copy only when the server's
 *  error code is genuinely unknown or unreachable. */
function bookingErrorKey(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'data' in error
      ? (error as { data?: { error?: { code?: unknown } } }).data?.error?.code
      : undefined;
  switch (code) {
    case 'SELF_BOOKING_FORBIDDEN':
      return 'search:details.selfBookingError';
    case 'DUPLICATE_BOOKING':
      return 'search:details.duplicateBookingError';
    case 'RIDE_NOT_BOOKABLE':
      return 'search:details.rideNotBookableError';
    // A detour match's free-form pickup/dropoff (requestSeat's free-form
    // fallback below) is independently re-validated server-side via a
    // real, live routing-engine detour check (bookings.service.ts's
    // assertRealDetourWithinAllowance) — the same real bound the search
    // result was found with. This only fires on a genuine, honest
    // rejection (the route changed, the point turned out too far, or the
    // routing engine was briefly unreachable) — never mislabel it as
    // "someone just took the seat".
    case 'VALIDATION_ERROR':
      return 'search:details.pickupNotAvailableError';
    case 'SEATS_UNAVAILABLE':
    default:
      return 'search:details.seatTakenError';
  }
}

/**
 * Stitch's "Ride Details - Stops & Distance" — the new intermediate screen
 * between search/results.tsx and search/trust.tsx. This is where the actual
 * booking request now happens (moved from trust.tsx, which is pure
 * driver-profile/trust content reached by tapping the driver row below).
 * Replaces the dropped search/cluster.tsx entirely — that screen's
 * multi-candidate map concept has no equivalent in the current design.
 */
export default function RideDetailsScreen(): React.JSX.Element {
  const { rideId, driverUserId } = useLocalSearchParams<{ rideId: string; driverUserId: string }>();
  const insets = useSafeAreaInsets();
  const { t, i18n } = useTranslation(['search', 'common', 'booking']);
  const locale = i18n.language as SupportedLocale;
  const { colors: theme } = useAppTheme();
  const dispatch = useAppDispatch();
  const origin = useAppSelector((s) => s.search.origin);
  const destination = useAppSelector((s) => s.search.destination);
  const searchAt = useAppSelector((s) => s.search.searchAt);
  const selectedStop = useAppSelector((s) => s.search.selectedStop);
  const selectedDropoffStop = useAppSelector((s) => s.search.selectedDropoffStop);
  const overriddenPickup = useAppSelector((s) => s.search.overriddenPickup);
  const accessToken = useAppSelector((s) => s.auth.accessToken);
  const [bookingError, setBookingError] = useState<string | undefined>();
  const [routeModalOpen, setRouteModalOpen] = useState(false);
  const showToast = useToast();

  const { data: ride, isLoading: isRideLoading, isError: isRideError, refetch: refetchRide } = useGetRideQuery(rideId);
  const {
    data: profile,
    isLoading: isProfileLoading,
    isError: isProfileError,
    refetch: refetchProfile,
  } = useGetUserPublicProfileQuery(driverUserId);
  const { data: stops } = useGetRideStopsQuery(rideId);
  const { data: passengers } = useListFellowPassengersQuery(rideId);
  const [createBooking, { isLoading: isBooking }] = useCreateBookingMutation();
  // Guest-skipped (a signed-out browser has neither an identity nor
  // bookings to compare against) — both feed the two guards below: a rider
  // can't book their own published ride, and can't send a second request
  // for one they already have pending/accepted.
  const { data: me } = useGetMeQuery(undefined, { skip: !accessToken });
  const { data: myBookings } = useListMyBookingsQuery(undefined, { skip: !accessToken });
  const isOwnRide = Boolean(me && me.id === driverUserId);
  const existingBooking = myBookings?.find(
    (b) => b.rideId === rideId && (b.status === 'pending' || b.status === 'accepted'),
  );
  const [registerPushToken] = useRegisterPushTokenMutation();
  const { requireAuth, isAuthSheetVisible, authTrigger, handleAuthenticated, cancelAuth } =
    useContextualAuth();
  // Asked once, right before the seat request is sent — never blocks it.
  const { ensureContactPhone, sheetProps: contactPhoneSheetProps } = useContactPhonePrompt();

  // Same cache entry results.tsx/pickup-point.tsx already populated — gives
  // us the real per-passenger pickup-walk minutes without a second fetch.
  const searchArgs =
    origin && destination
      ? {
          originLat: origin.lat,
          originLng: origin.lng,
          destinationLat: destination.lat,
          destinationLng: destination.lng,
          when: searchAt ?? new Date().toISOString(),
        }
      : undefined;
  const { data: searchResult } = useMatchingSearchQuery(searchArgs ?? skipToken);
  const candidate = useMemo(
    () => searchResult?.candidates.find((c) => c.rideId === rideId),
    [searchResult, rideId],
  );

  // A 'detour' match's pickup/dropoff are NOT points on the ride's own
  // route at all (that's the whole mechanic — the driver would leave their
  // route to reach them), so showing ride.routePolyline here would be a
  // real, reported bug: the passenger sees the driver's entire unrelated
  // trip instead of their own leg. Uses the real routing-engine polyline
  // computed specifically for THIS passenger's own origin -> pickup ->
  // dropoff -> destination insertion instead (candidate.detourRoutePolyline
  // — see matching.service.ts's scoreDetourCandidates).
  const isDetourMatch = candidate?.matchType === 'detour';
  const routeCoordinates = useMemo(() => {
    if (isDetourMatch) return candidate?.detourRoutePolyline ? decodePolyline(candidate.detourRoutePolyline) : [];
    return ride?.routePolyline ? decodePolyline(ride.routePolyline) : [];
  }, [isDetourMatch, candidate, ride]);

  // The passenger's OWN pickup/dropoff — a sub-segment of the driver's
  // route, never the driver's destination standing in for theirs. See
  // resolvePassengerSegmentPoints for the precedence rules. Matched by
  // stopId, not label text — a label match is fragile (two real stops can
  // share display text) and silently produced wrong results.
  const segmentPoints = resolvePassengerSegmentPoints({
    candidate,
    selectedPickup: selectedStop,
    selectedDropoff: selectedDropoffStop,
    searchOrigin: origin,
    searchDestination: destination,
    ride,
  });
  const pickupStopId = segmentPoints.pickup.stopId;
  const pickupStop = useMemo(
    () => stops?.find((s) => s.id === pickupStopId),
    [stops, pickupStopId],
  );
  const pickupLabel = pickupStop?.label ?? segmentPoints.pickup.label;
  const pickupWalkMeters = candidate?.pickupWalkMeters;
  const dropoffStopId = segmentPoints.dropoff.stopId;
  const dropoffLabel = segmentPoints.dropoff.label;
  const dropoffLat = segmentPoints.dropoff.lat;
  const dropoffLng = segmentPoints.dropoff.lng;

  // The passenger's own segment on the map — a route_passthrough booking's
  // real pickup/dropoff can sit well inside a much longer driver route
  // (matching-engine-redesign: "user should see only his route not the
  // entire driver route"). Falls back to the ride's own origin/destination
  // when no real stop exists, which for a plain endpoint match IS the whole
  // route — this one formula covers both cases without a separate branch.
  // A detour match uses the passenger's own searched origin instead — its
  // "route" (detourRoutePolyline above) already runs origin->pickup, not
  // the driver's own origin->pickup, so slicing from the driver's origin
  // would silently include a leg the passenger doesn't actually ride.
  const segmentOriginLat = pickupStop?.lat ?? segmentPoints.pickup.lat;
  const segmentOriginLng = pickupStop?.lng ?? segmentPoints.pickup.lng;
  const segmentOrigin =
    segmentOriginLat != null && segmentOriginLng != null
      ? { lat: segmentOriginLat, lng: segmentOriginLng }
      : undefined;
  const segmentDestination =
    dropoffLat != null && dropoffLng != null ? { lat: dropoffLat, lng: dropoffLng } : undefined;
  const segmentCoordinates = useMemo(() => {
    if (routeCoordinates.length < 2 || !segmentOrigin || !segmentDestination) return routeCoordinates;
    return sliceRouteBetween(
      routeCoordinates,
      { latitude: segmentOrigin.lat, longitude: segmentOrigin.lng },
      { latitude: segmentDestination.lat, longitude: segmentDestination.lng },
    );
    // Deps are the primitive lat/lng values, not segmentOrigin/
    // segmentDestination's object identity (which changes every render).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [routeCoordinates, segmentOriginLat, segmentOriginLng, dropoffLat, dropoffLng]);
  const segmentDistanceKm = useMemo(() => polylineDistanceKm(segmentCoordinates), [segmentCoordinates]);
  const fullDistanceKm = useMemo(() => polylineDistanceKm(routeCoordinates), [routeCoordinates]);
  // A real per-segment drive duration doesn't exist anywhere in the data
  // model (only the whole ride's estimatedDurationSec does) — deriving one
  // proportionally from real distances is an honest estimate, not a
  // fabricated number (the "~" prefix already shown next to it signals an
  // estimate). Naturally collapses to the ride's own real duration when the
  // segment IS the whole route (fullDistanceKm === segmentDistanceKm).
  const segmentDurationSec =
    ride?.estimatedDurationSec && fullDistanceKm > 0
      ? Math.round(ride.estimatedDurationSec * (segmentDistanceKm / fullDistanceKm))
      : ride?.estimatedDurationSec;
  const routeRegion = useMemo(() => {
    if (!segmentOrigin || !segmentDestination) return undefined;
    return regionForPoints([segmentOrigin, segmentDestination]) ?? undefined;
    // Same reasoning as segmentCoordinates above — primitive deps.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentOriginLat, segmentOriginLng, dropoffLat, dropoffLng]);

  // Driver-selected stops that come after the passenger's pickup point (and
  // before their dropoff point, when one is chosen) on the route and aren't
  // either of those same stops — real intermediate waypoints, not invented
  // ones. No per-stop ETA exists anywhere in the data model, so (unlike the
  // pickup row, which has a real departure time) these show no fabricated
  // clock time.
  const pickupSequence = pickupStop?.sequence ?? -1;
  const dropoffStop = useMemo(
    () => stops?.find((s) => s.id === dropoffStopId),
    [stops, dropoffStopId],
  );
  const dropoffSequence = dropoffStop?.sequence ?? Number.POSITIVE_INFINITY;
  const intermediateStops = useMemo(() => {
    // A detour match's stops are NOT on this passenger's leg at all (they
    // belong to the driver's own, unrelated route) — pickupSequence/
    // dropoffSequence default to -1/+Infinity when neither a pickup nor
    // dropoff stop exists, which would otherwise leak every one of the
    // ride's own stops in here as if they were real waypoints on a trip
    // this passenger never rides.
    if (isDetourMatch) return [];
    return (stops ?? []).filter(
      (s) => s.sequence > pickupSequence && s.sequence < dropoffSequence && s.id !== pickupStopId,
    );
  }, [isDetourMatch, stops, pickupSequence, dropoffSequence, pickupStopId]);
  const bookedSeats = ride ? ride.seatsTotal - ride.seatsAvailable : 0;

  // Stop confirmation (docs/domain/ride-engine.md, Phase 13 dropoff stops)
  // no longer gates *viewing* this screen — useOpenDriver.ts routes here
  // directly so a rider can browse several candidates freely. It's the
  // "Request a seat" CTA below that triggers it, only when the ride
  // actually has ranked stops to choose from and none is picked yet.
  //
  // Bug fixed here (matching-engine architecture plan §C): `rankedStops`
  // is empty both when the ride has no stops at all (free-form flow, fine
  // to fall through) AND when the ride HAS stops but none are walkable for
  // this passenger (candidate.pickupViable: false) — those two cases used
  // to be indistinguishable from `rankedStops.length` alone, so the second
  // one silently fell through to a free-form createBooking call on a ride
  // that requires a real pickupStopId, which the backend correctly rejects
  // with a 400. `!candidate.pickupViable` disambiguates them for an
  // 'endpoint'/'route_passthrough' match: there, it's only ever false when
  // the ride genuinely has zero stops, so routing to pickup-point.tsx
  // (which renders an honest "no reachable stop" EmptyState for this exact
  // case) is correct for both. A 'detour' match is a real THIRD case that
  // assumption doesn't cover: pickupViable is unconditionally false there
  // (matching.service.ts's scoreDetourCandidates — see MatchCandidate.
  // detour's own doc comment) regardless of whether the ride actually has
  // stops, and it never has any rankedStops to pick from at all — routing
  // it to the stops-only picker was a real dead end (an EmptyState with no
  // way forward) for a match that should instead go straight to a
  // free-form request, frictionlessly — no manual pickup-point form for a
  // detour match, ever (direct product feedback). createBooking now
  // independently re-validates a free-form pickup/dropoff on a stops-
  // having ride via a real, live routing-engine detour check (bookings.
  // service.ts's assertRealDetourWithinAllowance) before accepting it —
  // the same real bound this search result was found with in the first
  // place, so this only fails when something's genuinely changed (the
  // route, or the routing engine being briefly unreachable), never as a
  // routine rejection. See bookingErrorKey's VALIDATION_ERROR case for the
  // honest message shown on that rare failure.
  const needsPickupSelection = candidate
    ? candidate.matchType !== 'detour' &&
      (!candidate.pickupViable || candidate.rankedStops.length > 0) &&
      !selectedStop &&
      !overriddenPickup
    : false;
  const needsDropoffSelection =
    (candidate?.rankedDropoffStops.length ?? 0) > 0 && !selectedDropoffStop;

  function handleRequestPress(): void {
    // Defense in depth — the CTA is already disabled in both cases below,
    // but a driver viewing their own listing or a rider who already has an
    // active request for this ride must never be able to trigger a second
    // createBooking call regardless of how the tap reaches here.
    if (isOwnRide || existingBooking) return;
    if (needsPickupSelection) {
      router.push({ pathname: '/search/pickup-point', params: { rideId, driverUserId } });
      return;
    }
    if (needsDropoffSelection) {
      router.push({ pathname: '/search/dropoff-point', params: { rideId, driverUserId } });
      return;
    }
    ensureContactPhone(() => void requestSeat(), 'booking');
  }

  async function requestSeat(): Promise<void> {
    if (!selectedStop && !overriddenPickup && !origin) return;
    setBookingError(undefined);
    try {
      // A 'detour' match's dropoff is the passenger's own searched
      // destination (Zaragoza, e.g.) whenever it isn't already the ride's
      // own destination — omitting it here would silently default the
      // booking to the ride's own endpoint server-side, the exact "driver
      // sees the wrong requested route" bug already fixed for the map/
      // timeline display, but for the actual booking record this time.
      const freeformDropoff =
        !selectedDropoffStop && isDetourMatch && destination
          ? { dropoff: { label: destination.label, lat: destination.lat, lng: destination.lng } }
          : {};
      const booking = await createBooking({
        rideId,
        input: {
          seatsRequested: 1,
          ...(overriddenPickup
            ? {
                // M-040/EDGE-053: a real override away from the driver's
                // recommended stops (search/pickup-point.tsx's "choose
                // another point" affordance) — createBooking's own
                // assertRealDetourWithinAllowance independently re-
                // validates this against the ride's real route; the
                // previewPickupOverride recalculation already shown the
                // passenger the consequence before they got here.
                pickup: { label: overriddenPickup.label, lat: overriddenPickup.lat, lng: overriddenPickup.lng },
                ...(origin ? { requestedPickup: { label: origin.label, lat: origin.lat, lng: origin.lng } } : {}),
              }
            : selectedStop
              ? {
                  pickupStopId: selectedStop.stopId,
                  // M-004/M-020 (docs/unified_driver_and_passenger_journey.md
                  // §5/§13): the rider's own real searched point, alongside
                  // the chosen stop — lets createBooking independently
                  // re-derive and persist the real walk distance instead of
                  // trusting the stop id alone (bookings.service.ts's
                  // resolveStopWalkMeters). Previously never sent from any
                  // mobile call site, so this real backend capability had no
                  // real caller at all.
                  ...(origin ? { requestedPickup: { label: origin.label, lat: origin.lat, lng: origin.lng } } : {}),
                }
              : { pickup: { label: origin!.label, lat: origin!.lat, lng: origin!.lng } }),
          ...(selectedDropoffStop
            ? {
                dropoffStopId: selectedDropoffStop.stopId,
                ...(destination
                  ? { requestedDropoff: { label: destination.label, lat: destination.lat, lng: destination.lng } }
                  : {}),
              }
            : freeformDropoff),
        },
      }).unwrap();
      haptics.success();
      void requestPushPermissionAndRegister((args) => registerPushToken(args).unwrap());
      dispatch(clearSelectedStops());
      router.dismissTo({
        pathname: '/bookings/confirmed',
        params: {
          bookingId: booking.id,
          driverName: profile!.fullName,
          price: String(booking.contributionTotal),
          vehicleLabel: profile!.driver?.vehicle
            ? `${profile!.driver.vehicle.make} ${profile!.driver.vehicle.model} ${profile!.driver.vehicle.color}`
            : '',
          vehiclePlate: profile!.driver?.vehicle?.plateNumber ?? '',
          driverRatingAvg: profile!.driver ? String(profile!.driver.ratingAvg) : '',
          driverUserId,
          pickupLabel: booking.pickupLabel,
          destinationLabel: booking.dropoffLabel ?? ride!.destinationLabel,
          estimatedDurationMin: ride!.estimatedDurationSec
            ? String(Math.round(ride!.estimatedDurationSec / 60))
            : '',
          pickupLat: String(booking.pickupLat),
          pickupLng: String(booking.pickupLng),
          destinationLat: String(booking.dropoffLat ?? ride!.destinationLat),
          destinationLng: String(booking.dropoffLng ?? ride!.destinationLng),
        },
      });
    } catch (err) {
      haptics.error();
      setBookingError(t(bookingErrorKey(err)));
    }
  }

  if (isRideLoading || isProfileLoading || !ride || !profile) {
    const failed = isRideError || isProfileError;
    return (
      <View style={[styles.container, { backgroundColor: theme.background }]}>
        <ScreenHeader
          topInset={insets.top}
          onBack={() => router.back()}
          backLabel={t('common:actions.back')}
          title={t('search:details.screenTitle')}
        />
        {isRideLoading || isProfileLoading ? (
          <StateView status="loading" skeleton="detail" />
        ) : failed ? (
          <StateView
            status="error"
            title={t('search:details.loadError')}
            description={t('trips:loadError.description')}
            actionLabel={t('common:actions.retry')}
            onAction={() => {
              void refetchRide();
              void refetchProfile();
            }}
          />
        ) : (
          <StateView
            status="empty"
            iconName="car-outline"
            title={t('search:details.rideNotFound')}
            actionLabel={t('common:actions.back')}
            onAction={() => router.back()}
          />
        )}
      </View>
    );
  }

  const driverStats = profile.driver;
  const firstName = profile.fullName.split(' ')[0]!;
  const departureDate = new Date(ride.departureAt);
  const now = new Date();
  // The real time THIS passenger would be picked up/dropped off, not the
  // ride's own departure time re-shown as if it were theirs — a real bug
  // found live: a rider matched mid-route (route_passthrough/detour) saw
  // the driver's own origin departure time labeled as their pickup time,
  // with no arrival time shown anywhere on this screen. pickupEtaSeconds is
  // 0 for an 'endpoint' match (pickup ≈ the ride's own origin), so this
  // collapses to departureDate for every match type except the two where a
  // real offset exists. Falls back to the ride's own departure/estimated-
  // duration only while `candidate` hasn't loaded yet (e.g. this screen
  // opened from a deep link, without a matching search in flight) — an
  // honest best-available value, not a fabricated one.
  const pickupTime = candidate
    ? new Date(departureDate.getTime() + candidate.pickupEtaSeconds * 1000)
    : departureDate;
  const dropoffTime = candidate
    ? new Date(departureDate.getTime() + candidate.dropoffEtaSeconds * 1000)
    : ride.estimatedDurationSec
      ? new Date(departureDate.getTime() + ride.estimatedDurationSec * 1000)
      : undefined;

  const dayTitle = isSameDay(departureDate, now)
    ? t('common:time.today')
    : isSameDay(departureDate, addDays(now, 1))
      ? t('common:time.tomorrow')
      : (() => {
          const l = formatDate(departureDate, locale, { weekday: 'long' });
          return l.charAt(0).toUpperCase() + l.slice(1);
        })();
  const pickupPoint = {
    lat: pickupStop?.lat ?? segmentOrigin?.lat ?? ride.originLat,
    lng: pickupStop?.lng ?? segmentOrigin?.lng ?? ride.originLng,
  };
  const dropoffPoint = { lat: dropoffLat ?? ride.destinationLat, lng: dropoffLng ?? ride.destinationLng };
  const pickupPlace = pickupLabel ?? ride.originLabel;
  const dropoffPlace = dropoffLabel ?? ride.destinationLabel;
  // Frame the real road geometry of this passenger's leg, not just its two
  // ends — a curving route used to run off the edge of the preview.
  const legRegion =
    regionForPoints([
      ...segmentCoordinates.map((c) => ({ lat: c.latitude, lng: c.longitude })),
      pickupPoint,
      dropoffPoint,
    ]) ?? routeRegion;

  // The passenger's own ride, pickup to drop-off through any pass-through
  // stops — what both "see your ride" buttons open.
  const yourRideDirections = {
    origin: pickupPoint,
    destination: dropoffPoint,
    waypoints: intermediateStops.map((s) => ({ lat: s.lat, lng: s.lng })),
  };

  function openInMaps(options: Parameters<typeof openDirections>[0]): void {
    void openDirections(options).then((opened) => {
      if (!opened) showToast({ message: t('search:details.mapsUnavailable'), tone: 'error' });
    });
  }

  const legMarkers = (
    <>
      <Marker coordinate={{ latitude: pickupPoint.lat, longitude: pickupPoint.lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={20}>
        <PickupPin theme={theme} />
      </Marker>
      {intermediateStops.map((stop) => (
        <Marker key={stop.id} coordinate={{ latitude: stop.lat, longitude: stop.lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={10}>
          <View style={[styles.stopDot, { backgroundColor: theme.surface, borderColor: theme.accentStrong }]} />
        </Marker>
      ))}
      <Marker coordinate={{ latitude: dropoffPoint.lat, longitude: dropoffPoint.lng }} anchor={{ x: 0.5, y: 0.5 }} zIndex={20}>
        <DropoffPin theme={theme} />
      </Marker>
    </>
  );

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <ScreenHeader
        topInset={insets.top}
        onBack={() => router.back()}
        backLabel={t('common:actions.back')}
        title={t('search:details.screenTitle')}
      />

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* The passenger's own leg, drawn with the shared RouteLine so it
         *  reads on any terrain (it was a thin ink line on a dark map). */}
        <View style={styles.mapWrap}>
          <MapCanvas region={legRegion} height={MAP_HEIGHT} tint={false}>
            <RouteLine coordinates={segmentCoordinates} theme={theme} />
            {legMarkers}
          </MapCanvas>
          {segmentDurationSec ? (
            <View style={[styles.mapChip, { backgroundColor: theme.surface }]}>
              <Icon name="time-outline" size="xs" color={theme.ink} />
              <Text variant="caption" color={theme.ink} style={styles.mapChipText}>
                {segmentDistanceKm > 0
                  ? t('search:details.legSummary', {
                      duration: durationLabel(segmentDurationSec, t),
                      distance: t('common:terms.km', { count: Math.round(segmentDistanceKm) }),
                    })
                  : durationLabel(segmentDurationSec, t)}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            style={[styles.mapExpand, { backgroundColor: theme.surface }]}
            onPress={() => setRouteModalOpen(true)}
            activeOpacity={0.85}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('search:details.viewRouteFullscreen')}
          >
            <Icon name="expand-outline" size="sm" color={theme.ink} />
          </TouchableOpacity>
        </View>

        {/* The ticket: the journey on top, who drives below the
         *  perforation — one object to read, not four identical boxes. */}
        <View style={[styles.ticket, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <View style={styles.ticketTop}>
            <View style={styles.ticketHeader}>
              <View style={styles.ticketHeaderLeft}>
                <Text variant="headlineDisplay" color={theme.ink}>
                  {dayTitle}
                </Text>
                <Text variant="bodySmall" color={theme.inkMuted}>
                  {fullDateLabel(departureDate, locale)}
                </Text>
              </View>
              <View style={styles.ticketHeaderRight}>
                <Text variant="headlineDisplay" color={theme.ink}>
                  {formatCurrency(ride.contributionPerSeat, locale)}
                </Text>
                <Text variant="bodySmall" color={theme.inkMuted}>
                  {t('search:details.perSeat')}
                </Text>
              </View>
            </View>

            <View style={styles.journey}>
              <JourneyStop
                time={formatTime(pickupTime, locale)}
                title={shortenPlaceLabel(pickupPlace)}
                address={fullPlaceLabel(pickupPlace)}
                note={
                  pickupWalkMeters !== undefined && pickupWalkMeters > 0
                    ? t('search:details.walkToMeetingPoint', { minutes: accessAmount(t, pickupWalkMeters, locale) })
                    : undefined
                }
                kind="pickup"
                theme={theme}
                mapsLabel={t('search:details.mapsToPickup')}
                onOpenMaps={() => openInMaps({ destination: pickupPoint, travelMode: 'walking' })}
              />
              {intermediateStops.map((stop) => (
                <View key={stop.id} style={styles.journeyRow}>
                  <View style={styles.timeCol} />
                  <View style={styles.railCol}>
                    <View style={[styles.railLine, styles.railLineShort, { backgroundColor: theme.accent }]} />
                    <View style={[styles.railStopDot, { backgroundColor: theme.surface, borderColor: theme.accentStrong }]} />
                    <View style={[styles.railLine, styles.railLineShort, { backgroundColor: theme.accent }]} />
                  </View>
                  <View style={styles.passThroughRow}>
                    <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={1} style={styles.passThroughName}>
                      {shortenPlaceLabel(stop.label)}
                    </Text>
                    <Text variant="caption" color={theme.inkFaint}>
                      {t('search:details.briefStop')}
                    </Text>
                  </View>
                </View>
              ))}
              <JourneyStop
                time={dropoffTime ? formatTime(dropoffTime, locale) : undefined}
                title={shortenPlaceLabel(dropoffPlace)}
                address={fullPlaceLabel(dropoffPlace)}
                kind="dropoff"
                theme={theme}
                mapsLabel={t('search:details.mapsYourRide')}
                onOpenMaps={() => openInMaps(yourRideDirections)}
              />
            </View>
          </View>

          <Perforation theme={theme} />

          <TouchableOpacity
            style={styles.driverRow}
            onPress={() => router.push({ pathname: '/search/trust', params: { rideId, driverUserId } })}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={t('search:details.viewDriverProfile', { name: firstName })}
          >
            <View>
              <Avatar uri={profile.avatarUrl} name={profile.fullName} sizePx={DRIVER_AVATAR_PX} />
              {driverStats ? (
                <View style={[styles.verifiedBadge, { backgroundColor: theme.accentStrong, borderColor: theme.surface }]}>
                  <Icon name="checkmark" size="xs" color={theme.onAccent} />
                </View>
              ) : null}
            </View>
            <View style={styles.driverText}>
              <Text variant="label" color={theme.ink} style={styles.driverName}>
                {firstName}
              </Text>
              {driverStats ? (
                <View style={styles.inlineRow}>
                  {driverStats.tripCount > 0 ? (
                    <>
                      <Icon name="star" size="xs" color={theme.accentStrong} />
                      <Text variant="bodySmall" color={theme.ink}>
                        {driverStats.ratingAvg.toFixed(1)}
                      </Text>
                      <Text variant="bodySmall" color={theme.inkMuted}>
                        {t('common:terms.tripCount', { count: driverStats.tripCount })}
                      </Text>
                    </>
                  ) : (
                    <>
                      <Icon name="sparkles-outline" size="xs" color={theme.accentStrong} />
                      <Text variant="bodySmall" color={theme.inkMuted}>
                        {t('search:details.newDriver')}
                      </Text>
                    </>
                  )}
                </View>
              ) : null}
              {driverStats?.vehicle ? (
                <View style={styles.inlineRow}>
                  <Icon name="car-sport-outline" size="xs" color={theme.inkMuted} />
                  <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={1}>
                    {t('search:details.vehicleLine', {
                      model: `${driverStats.vehicle.make} ${driverStats.vehicle.model}`,
                      color: driverStats.vehicle.color,
                    })}
                  </Text>
                </View>
              ) : null}
            </View>
            <Icon name="chevron-forward" size="sm" color={theme.inkFaint} />
          </TouchableOpacity>
        </View>

        {/* Who's in the car, as the car's seats: taken ones show who took
         *  them, free ones are open — availability at a glance, and a
         *  different shape from the driver above. */}
        <View style={styles.seatsSection}>
          <View style={styles.seatsHeader}>
            <Text variant="label" color={theme.ink}>
              {t('search:details.travellingWith')}
            </Text>
            <Text variant="bodySmall" color={theme.inkMuted}>
              {t('search:details.seatsTaken', { count: bookedSeats, total: ride.seatsTotal })}
            </Text>
          </View>
          <SeatRow
            seatsTotal={ride.seatsTotal}
            bookedSeats={bookedSeats}
            passengers={passengers ?? []}
            freeLabel={t('search:details.freeSeat')}
            takenLabel={t('search:details.takenSeat')}
            theme={theme}
          />
        </View>

        <View style={styles.scrollSpacer} />
      </ScrollView>

      {isOwnRide ? null : (
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outlineVariant, paddingBottom: insets.bottom + spacing.sm }]}>
          {bookingError ? (
            <Text variant="bodySmall" color={theme.error} align="center">
              {bookingError}
            </Text>
          ) : null}
          <Button
            size="lg"
            label={existingBooking ? t('search:details.alreadyRequested') : t('search:details.requestSeat')}
            loading={isBooking}
            disabled={
              Boolean(existingBooking) ||
              ride.seatsAvailable < 1 ||
              (!needsPickupSelection && !needsDropoffSelection && !selectedStop && !origin)
            }
            accessibilityLabel={
              existingBooking
                ? t('search:details.alreadyRequested')
                : t('search:details.requestSeatWithPrice', { price: ride.contributionPerSeat })
            }
            onPress={() => requireAuth(handleRequestPress, 'booking')}
            style={styles.cta}
          />
        </View>
      )}

      <Modal
        visible={routeModalOpen}
        animationType="slide"
        onRequestClose={() => setRouteModalOpen(false)}
      >
        <View style={[styles.routeModal, { backgroundColor: theme.background }]}>
          <MapCanvas region={legRegion} style={styles.routeModalMap} tint={false}>
            <RouteLine coordinates={segmentCoordinates} size="full" theme={theme} />
            {legMarkers}
          </MapCanvas>
          <View style={[styles.routeModalClose, { top: insets.top + spacing.sm }]}>
            <HeaderIconButton
              icon="close"
              onPress={() => setRouteModalOpen(false)}
              accessibilityLabel={t('common:actions.close')}
            />
          </View>
          <View style={[styles.routeModalFooter, { bottom: insets.bottom + spacing.md }]}>
            <Button
              label={t('search:details.openInGoogleMaps')}
              theme={theme}
              onPress={() => openInMaps(yourRideDirections)}
            />
          </View>
        </View>
      </Modal>

      <ContactPhoneSheet {...contactPhoneSheetProps} />
      <ContextualAuthSheet
        visible={isAuthSheetVisible}
        trigger={authTrigger}
        onClose={cancelAuth}
        onAuthenticated={handleAuthenticated}
      />
    </View>
  );
}

const MAP_HEIGHT = 220;
const DRIVER_AVATAR_PX = 52;
const SEAT_PX = 48;
const NOTCH_PX = 20;

type Palette = ReturnType<typeof useAppTheme>['colors'];

/** One end of the passenger's leg on the ticket: the time in its own
 *  column (a timetable, not a form), the short place name, the full
 *  address under it, and a way out to Google Maps. */
function JourneyStop({
  time,
  title,
  address,
  note,
  kind,
  theme,
  mapsLabel,
  onOpenMaps,
}: {
  time?: string;
  title: string;
  address: string;
  note?: string;
  kind: 'pickup' | 'dropoff';
  theme: Palette;
  mapsLabel: string;
  onOpenMaps: () => void;
}): React.JSX.Element {
  const isPickup = kind === 'pickup';
  return (
    <View style={styles.journeyRow}>
      <View style={styles.timeCol}>
        {time ? (
          <Text variant="label" color={theme.ink} style={styles.timeText}>
            {time}
          </Text>
        ) : null}
      </View>
      <View style={styles.railCol}>
        {/* Lead-in above the dot: the line arriving at the drop-off, or
         *  empty space above the pickup (nothing comes before it). */}
        <View style={[styles.railLead, !isPickup ? { backgroundColor: theme.accent } : null]} />
        <View
          style={[
            styles.railDot,
            isPickup
              ? { backgroundColor: theme.surface, borderColor: theme.accent }
              : { backgroundColor: theme.ink, borderColor: theme.ink },
          ]}
        />
        {isPickup ? <View style={[styles.railLine, { backgroundColor: theme.accent }]} /> : null}
      </View>
      <View style={[styles.stopTextCol, isPickup ? styles.stopTextColPickup : null]}>
        <View style={styles.stopTitleRow}>
          <Text variant="label" color={theme.ink} numberOfLines={1} style={styles.stopTitle}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={onOpenMaps}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel={mapsLabel}
            style={[styles.mapsButton, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}
          >
            <Icon name="navigate-outline" size="xs" color={theme.ink} />
          </TouchableOpacity>
        </View>
        {/* Only when it adds something — "Gare de Sousse" twice says nothing. */}
        {address !== title ? (
          <Text variant="bodySmall" color={theme.inkMuted} numberOfLines={2}>
            {address}
          </Text>
        ) : null}
        {note ? (
          <View style={styles.inlineRow}>
            <Icon name="walk-outline" size="xs" color={theme.accentStrong} />
            <Text variant="caption" color={theme.accentStrong} style={styles.noteText}>
              {note}
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}

/** The ticket's tear line: two notches cut from the edges and a dashed
 *  rule between them. */
function Perforation({ theme }: { theme: Palette }): React.JSX.Element {
  return (
    <View style={styles.perforation} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.notch, styles.notchLeft, { backgroundColor: theme.background, borderColor: theme.outlineVariant }]} />
      <View style={[styles.perforationRule, { borderColor: theme.outlineVariant }]} />
      <View style={[styles.notch, styles.notchRight, { backgroundColor: theme.background, borderColor: theme.outlineVariant }]} />
    </View>
  );
}

/** The car's passenger seats, in order: fellow passengers (first name and
 *  photo only — that endpoint's own privacy boundary, so never a profile
 *  link), seats booked by someone not listed (a multi-seat booking), then
 *  free seats. */
function SeatRow({
  seatsTotal,
  bookedSeats,
  passengers,
  freeLabel,
  takenLabel,
  theme,
}: {
  seatsTotal: number;
  bookedSeats: number;
  passengers: { userId: string; firstName: string; avatarUrl: string | null }[];
  freeLabel: string;
  takenLabel: string;
  theme: Palette;
}): React.JSX.Element {
  const shown = passengers.slice(0, bookedSeats);
  const unnamedTaken = Math.max(bookedSeats - shown.length, 0);
  const free = Math.max(seatsTotal - bookedSeats, 0);
  return (
    <View style={styles.seatRow} accessibilityRole="list">
      {shown.map((p) => (
        <View key={p.userId} style={styles.seat} accessible accessibilityLabel={p.firstName}>
          <Avatar uri={p.avatarUrl ?? undefined} name={p.firstName} sizePx={SEAT_PX} />
          <Text variant="caption" color={theme.ink} numberOfLines={1}>
            {p.firstName}
          </Text>
        </View>
      ))}
      {Array.from({ length: unnamedTaken }).map((_, i) => (
        <View key={`taken-${i}`} style={styles.seat} accessible accessibilityLabel={takenLabel}>
          <View style={[styles.seatCircle, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}>
            <Icon name="person" size="sm" color={theme.inkMuted} />
          </View>
          <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
            {takenLabel}
          </Text>
        </View>
      ))}
      {Array.from({ length: free }).map((_, i) => (
        <View key={`free-${i}`} style={styles.seat} accessible accessibilityLabel={freeLabel}>
          <View style={[styles.seatCircle, styles.seatFree, { borderColor: theme.accent }]}>
            <Icon name="add" size="sm" color={theme.accentStrong} />
          </View>
          <Text variant="caption" color={theme.accentStrong} numberOfLines={1}>
            {freeLabel}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  mapWrap: {
    position: 'relative',
  },
  mapChip: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    ...elevation.sm,
  },
  mapChipText: {
    fontWeight: '600',
  },
  mapExpand: {
    position: 'absolute',
    right: spacing.sm,
    top: spacing.sm,
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    ...elevation.sm,
  },
  ticket: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
    ...elevation.sm,
  },
  ticketTop: {
    padding: spacing.lg,
    gap: spacing.lg,
  },
  ticketHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  ticketHeaderLeft: {
    flex: 1,
    gap: 2,
  },
  ticketHeaderRight: {
    alignItems: 'flex-end',
    gap: 2,
  },
  journey: {},
  journeyRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: spacing.sm,
  },
  // Time and rail dot sit level with the stop's title row (minHeight 34).
  timeCol: {
    width: 48,
    paddingTop: 7,
  },
  timeText: {
    fontVariant: ['tabular-nums'],
  },
  railCol: {
    width: 14,
    alignItems: 'center',
  },
  railDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 3,
  },
  railLead: {
    width: 2,
    height: 10,
  },
  railLine: {
    flex: 1,
    width: 2,
    minHeight: spacing.md,
  },
  railStopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  stopTextCol: {
    flex: 1,
    gap: 2,
  },
  stopTextColPickup: {
    paddingBottom: spacing.lg,
  },
  stopTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    minHeight: 34,
  },
  stopTitle: {
    flex: 1,
  },
  noteText: {
    flex: 1,
  },
  railLineShort: {
    minHeight: spacing.sm,
  },
  passThroughRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.sm,
  },
  passThroughName: {
    flexShrink: 1,
  },
  mapsButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  perforation: {
    flexDirection: 'row',
    alignItems: 'center',
    height: NOTCH_PX,
  },
  notch: {
    width: NOTCH_PX,
    height: NOTCH_PX,
    borderRadius: NOTCH_PX / 2,
    borderWidth: 1,
  },
  notchLeft: {
    marginLeft: -NOTCH_PX / 2,
  },
  notchRight: {
    marginRight: -NOTCH_PX / 2,
  },
  perforationRule: {
    flex: 1,
    borderTopWidth: 1.5,
    borderStyle: 'dashed',
    marginHorizontal: spacing.sm,
  },
  driverRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  verifiedBadge: {
    position: 'absolute',
    right: -2,
    bottom: -2,
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  driverText: {
    flex: 1,
    gap: 3,
  },
  driverName: {
    fontSize: 17,
  },
  seatsSection: {
    gap: spacing.md,
  },
  seatsHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  seatRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.lg,
  },
  seat: {
    width: SEAT_PX + 8,
    alignItems: 'center',
    gap: spacing.xs,
  },
  seatCircle: {
    width: SEAT_PX,
    height: SEAT_PX,
    borderRadius: SEAT_PX / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  seatFree: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  stopDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2.5,
  },
  scrollSpacer: {
    height: 90,
  },
  footer: {
    borderTopWidth: 1,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.md,
    gap: spacing.sm,
  },
  // Layout only — shape, size and colors come from the design-system Button.
  cta: {
    width: '100%',
  },
  routeModal: {
    flex: 1,
  },
  routeModalMap: {
    flex: 1,
  },
  routeModalClose: {
    position: 'absolute',
    right: spacing.lg,
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  routeModalFooter: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
  },
});
