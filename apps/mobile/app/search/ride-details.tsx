import { useMemo, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, ActivityIndicator, ScrollView, Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Marker, Polyline } from 'react-native-maps';
import { Ionicons } from '@expo/vector-icons';
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
import { formatDate, formatTime, splitDurationMinutes } from '../../src/utils/localeFormat';

type TFn = (key: string, params?: Record<string, unknown>) => string;

function fullDateLabel(date: Date, locale: SupportedLocale): string {
  const label = formatDate(date, locale, { weekday: 'long', day: 'numeric', month: 'long' });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function durationLabel(seconds: number, t: TFn): string {
  const { hours, minutes } = splitDurationMinutes(seconds / 60);
  if (hours === 0) return t('search:details.durationMinutesOnly', { minutes });
  if (minutes === 0) return t('search:details.durationHoursOnly', { hours });
  return t('search:details.durationHoursMinutes', { hours, minutes });
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

  const { data: ride, isLoading: isRideLoading } = useGetRideQuery(rideId);
  const { data: profile, isLoading: isProfileLoading } = useGetUserPublicProfileQuery(driverUserId);
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

  // Matched by stopId, not label text — a label match is fragile (two real
  // stops can share display text) and silently produced wrong results.
  const pickupStopId = selectedStop?.stopId ?? candidate?.rankedStops[0]?.stopId;
  const pickupStop = useMemo(
    () => stops?.find((s) => s.id === pickupStopId),
    [stops, pickupStopId],
  );
  // A detour match has no real driver-selected stop at all (pickupViable:
  // false, by design — see MatchCandidate.detour's doc comment) — the
  // passenger's own searched origin/destination (search.origin/destination,
  // exactly what scoreDetourCandidates computed the detour against) IS the
  // real pickup/dropoff point in that case, never the driver's own
  // origin/destination label.
  const pickupLabel = isDetourMatch
    ? (origin?.label ?? ride?.originLabel)
    : (pickupStop?.label ?? selectedStop?.label ?? candidate?.rankedStops[0]?.label ?? ride?.originLabel);
  const pickupWalkMinutes = candidate?.pickupWalkMinutes;
  // A route-passthrough match (Phase 13, docs/roadmap/phase-13-search-engine.md)
  // may have a dropoff stop the passenger explicitly chose on
  // search/dropoff-point.tsx. For a plain endpoint match there's no such
  // passenger choice to make, but the RIDE itself may still have a real
  // driver-confirmed dropoff stop (the second of the pickup/dropoff pair
  // Publish's map-selection flow persists) — falling back straight to
  // ride.destinationLabel skipped that real, more precise point entirely.
  // Only once neither exists does this fall back to the ride's own
  // general destination, exactly as every booking behaved before dropoff
  // stops existed.
  const rideDropoffStop = useMemo(() => {
    if (!stops || stops.length === 0) return undefined;
    return [...stops].sort((a, b) => b.sequence - a.sequence)[0];
  }, [stops]);
  const dropoffStopId = selectedDropoffStop?.stopId ?? rideDropoffStop?.id;
  const dropoffLabel = isDetourMatch
    ? (destination?.label ?? ride?.destinationLabel)
    : (selectedDropoffStop?.label ?? rideDropoffStop?.label ?? ride?.destinationLabel);
  const dropoffLat = isDetourMatch
    ? (destination?.lat ?? ride?.destinationLat)
    : (selectedDropoffStop?.lat ?? rideDropoffStop?.lat ?? ride?.destinationLat);
  const dropoffLng = isDetourMatch
    ? (destination?.lng ?? ride?.destinationLng)
    : (selectedDropoffStop?.lng ?? rideDropoffStop?.lng ?? ride?.destinationLng);

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
  const segmentOriginLat = isDetourMatch ? origin?.lat : (pickupStop?.lat ?? ride?.originLat);
  const segmentOriginLng = isDetourMatch ? origin?.lng : (pickupStop?.lng ?? ride?.originLng);
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
    void requestSeat();
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

  if (isRideLoading || isProfileLoading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!ride || !profile) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <Text variant="body" color={theme.inkFaint}>
          {t('search:details.rideNotFound')}
        </Text>
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

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      <View
        style={[
          styles.header,
          { paddingTop: insets.top + spacing.sm, backgroundColor: theme.surface, borderBottomColor: theme.outlineVariant },
        ]}
      >
        <TouchableOpacity
          onPress={() => router.back()}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel={t('common:actions.back')}
        >
          <Ionicons name="chevron-back" size={22} color={theme.ink} />
        </TouchableOpacity>
        <Text variant="h3" color={theme.ink}>
          Vaya
        </Text>
        <View style={{ width: 22 }} />
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.summaryRow}>
          <View>
            <Text variant="h2" color={theme.ink}>
              {isSameDay(departureDate, now)
                ? t('common:time.today')
                : isSameDay(departureDate, new Date(now.getTime() + 24 * 60 * 60_000))
                  ? t('common:time.tomorrow')
                  : (() => {
                      const l = formatDate(departureDate, locale, { weekday: 'long' });
                      return l.charAt(0).toUpperCase() + l.slice(1);
                    })()}
            </Text>
            <Text variant="bodySmall" color={theme.inkFaint}>
              {fullDateLabel(departureDate, locale)}
            </Text>
          </View>
          <View style={styles.summaryPriceCol}>
            <Text variant="h2" color={theme.ink}>
              {ride.contributionPerSeat}
              <Text variant="label" color={theme.inkFaint}>
                {' '}
                DT
              </Text>
            </Text>
            <Text variant="bodySmall" color={theme.inkFaint}>
              {t('search:details.seatsAvailable', { count: ride.seatsAvailable })}
            </Text>
          </View>
        </View>

        <View style={styles.mapCard}>
          <MapCanvas region={routeRegion} height={160} style={styles.mapCanvas}>
            {segmentCoordinates.length > 1 ? (
              <Polyline coordinates={segmentCoordinates} strokeColor={theme.ink} strokeWidth={4} />
            ) : null}
            {/* The real pickup point when one is resolved (a driver-
             *  confirmed route_stop) — the premium PickupPin, same as
             *  everywhere else this concept renders. Falls back to a plain
             *  origin dot only when no real stop exists yet. */}
            {pickupStop ? (
              <Marker
                coordinate={{ latitude: pickupStop.lat, longitude: pickupStop.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <PickupPin theme={theme} />
              </Marker>
            ) : (
              <Marker
                coordinate={{
                  latitude: segmentOrigin?.lat ?? ride.originLat,
                  longitude: segmentOrigin?.lng ?? ride.originLng,
                }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.originDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
              </Marker>
            )}
            {/* Genuine pass-through waypoints only — pickup/dropoff get
             *  their own dedicated pins below, not this neutral dot. */}
            {intermediateStops.map((stop) => (
              <Marker
                key={stop.id}
                coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.stopDot, { backgroundColor: theme.surface, borderColor: theme.ink }]} />
              </Marker>
            ))}
            <Marker
              coordinate={{ latitude: dropoffLat ?? ride.destinationLat, longitude: dropoffLng ?? ride.destinationLng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {dropoffStop || selectedDropoffStop ? (
                <DropoffPin theme={theme} />
              ) : (
                <View style={[styles.destDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
              )}
            </Marker>
          </MapCanvas>

          {segmentDurationSec ? (
            <View style={[styles.mapValuesBadge, { backgroundColor: theme.surface }]}>
              <Text variant="caption" color={theme.ink} style={styles.mapValuesText}>
                ~{durationLabel(segmentDurationSec, t)}
                {segmentDistanceKm > 0
                  ? ` · ${t('common:terms.km', { count: Math.round(segmentDistanceKm) })}`
                  : ''}
              </Text>
            </View>
          ) : null}

          <TouchableOpacity
            style={[styles.viewRouteBtn, { backgroundColor: theme.surface }]}
            onPress={() => setRouteModalOpen(true)}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={t('search:details.viewRouteFullscreen')}
          >
            <Icon name="expand-outline" size="xs" color={theme.ink} />
            <Text variant="caption" color={theme.ink}>
              {t('search:details.viewRouteFullscreen')}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={[styles.timeline, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <View style={styles.timelineRow}>
            <View style={styles.timelineMarkerCol}>
              <View style={[styles.timelineDot, styles.timelineDotOpen, { borderColor: theme.ink }]} />
              <View style={[styles.timelineLine, { backgroundColor: theme.outlineVariant }]} />
            </View>
            <View style={styles.timelineTextCol}>
              <View style={styles.timelineRoleRow}>
                <Text variant="label" color={theme.ink}>
                  {formatTime(pickupTime, locale)}
                </Text>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.pickup')}
                </Text>
              </View>
              <Text variant="body" color={theme.ink}>
                {pickupLabel ?? ride.originLabel}
              </Text>
              {pickupWalkMinutes !== undefined ? (
                <Text variant="caption" color={theme.inkFaint}>
                  {t('search:details.walkToMeetingPoint', {
                    minutes: t('common:terms.minute', { count: Math.round(pickupWalkMinutes) }),
                  })}
                </Text>
              ) : null}
            </View>
          </View>

          {intermediateStops.map((stop) => (
            <View key={stop.id} style={styles.timelineRow}>
              <View style={styles.timelineMarkerCol}>
                <View style={[styles.timelineDot, styles.timelineDotStop, { borderColor: theme.outline }]} />
                <View style={[styles.timelineLine, { backgroundColor: theme.outlineVariant }]} />
              </View>
              <View style={styles.timelineTextCol}>
                <Text variant="body" color={theme.inkMuted}>
                  {stop.label}
                </Text>
                <Text variant="caption" color={theme.inkFaint}>
                  {t('search:details.briefStop')}
                </Text>
              </View>
            </View>
          ))}

          <View style={[styles.timelineRow, styles.timelineRowLast]}>
            <View style={styles.timelineMarkerCol}>
              <View style={[styles.timelineDot, styles.timelineDotFilled, { backgroundColor: theme.ink }]} />
            </View>
            <View style={styles.timelineTextCol}>
              <View style={styles.timelineRoleRow}>
                {dropoffTime ? (
                  <Text variant="label" color={theme.ink}>
                    {formatTime(dropoffTime, locale)}
                  </Text>
                ) : null}
                <Text variant="caption" color={theme.inkFaint}>
                  {t('common:terms.dropoff')}
                </Text>
              </View>
              <Text variant="body" color={theme.ink}>
                {dropoffLabel ?? ride.destinationLabel}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity
          style={[styles.driverCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}
          onPress={() => router.push({ pathname: '/search/trust', params: { rideId, driverUserId } })}
          activeOpacity={0.8}
          accessibilityRole="button"
          accessibilityLabel={t('search:details.viewDriverProfile', { name: firstName })}
        >
          <Avatar
            uri={profile.avatarUrl}
            name={profile.fullName}
            size="md"
            fallbackBackgroundColor={theme.surfaceMuted}
            fallbackTextColor={theme.ink}
          />
          <View style={styles.driverTextCol}>
            <View style={styles.driverNameRow}>
              <Text variant="label" color={theme.ink}>
                {firstName}
              </Text>
              {driverStats ? <Icon name="checkmark-circle" size="xs" color={theme.accent} /> : null}
            </View>
            {driverStats ? (
              <View style={styles.driverStatsRow}>
                <Icon name="star" size="xs" color={theme.accent} />
                <Text variant="caption" color={theme.inkMuted}>
                  {driverStats.ratingAvg.toFixed(1)} · {t('common:terms.trip', { count: driverStats.tripCount })}
                </Text>
              </View>
            ) : null}
          </View>
          <Icon name="chevron-forward" size="sm" color={theme.inkFaint} />
        </TouchableOpacity>

        {driverStats?.vehicle ? (
          <View style={[styles.vehicleCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
            <View style={[styles.vehicleIconWrap, { backgroundColor: theme.background, borderColor: theme.outlineVariant }]}>
              <Icon name="car-sport" size="md" color={theme.inkFaint} />
            </View>
            <View>
              <Text variant="label" color={theme.ink}>
                {t('common:terms.vehicle')}
              </Text>
              <Text variant="bodySmall" color={theme.inkMuted}>
                {driverStats.vehicle.make} {driverStats.vehicle.model} · {driverStats.vehicle.color}
              </Text>
            </View>
          </View>
        ) : null}

        {passengers && passengers.length > 0 ? (
          <View style={styles.passengersSection}>
            <Text variant="caption" color={theme.inkFaint} style={styles.passengersTitle}>
              {t('search:details.passengersHeader', { booked: bookedSeats, total: ride.seatsTotal }).toUpperCase()}
            </Text>
            <View style={[styles.card, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              {passengers.map((passenger, i) => (
                <View
                  key={passenger.userId}
                  style={[styles.passengerRow, i > 0 && { borderTopColor: theme.outlineVariant, borderTopWidth: 1 }]}
                >
                  <Avatar
                    uri={passenger.avatarUrl}
                    name={passenger.firstName}
                    size="sm"
                    fallbackBackgroundColor={theme.surfaceMuted}
                    fallbackTextColor={theme.ink}
                  />
                  <Text variant="body" color={theme.ink} style={styles.passengerName}>
                    {passenger.firstName}
                  </Text>
                  <Icon name="star" size="xs" color={theme.accent} />
                  <Text variant="bodySmall" color={theme.inkMuted}>
                    {passenger.ratingAvg.toFixed(1)}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ) : null}

        <View style={styles.scrollSpacer} />
      </ScrollView>

      {isOwnRide ? null : (
        <View style={[styles.footer, { backgroundColor: theme.surface, borderTopColor: theme.outlineVariant, paddingBottom: insets.bottom + spacing.sm }]}>
          {bookingError ? (
            <Text variant="bodySmall" color={theme.error} align="center">
              {bookingError}
            </Text>
          ) : null}
          <TouchableOpacity
            style={[
              styles.cta,
              { backgroundColor: theme.ink },
              Boolean(existingBooking) ||
              (!needsPickupSelection &&
                !needsDropoffSelection &&
                !selectedStop &&
                !origin) ||
              ride.seatsAvailable < 1
                ? styles.ctaDisabled
                : null,
            ]}
            disabled={
              isBooking ||
              Boolean(existingBooking) ||
              ride.seatsAvailable < 1 ||
              (!needsPickupSelection && !needsDropoffSelection && !selectedStop && !origin)
            }
            activeOpacity={0.85}
            onPress={() => requireAuth(handleRequestPress, 'booking')}
            accessibilityRole="button"
            accessibilityLabel={
              existingBooking
                ? t('search:details.alreadyRequested')
                : t('search:details.requestSeatWithPrice', { price: ride.contributionPerSeat })
            }
          >
            {isBooking ? (
              <ActivityIndicator color={theme.onInk} size="small" />
            ) : (
              <Text variant="label" color={theme.onInk}>
                {existingBooking ? t('search:details.alreadyRequested') : t('search:details.requestSeat')}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      )}

      <Modal
        visible={routeModalOpen}
        animationType="slide"
        onRequestClose={() => setRouteModalOpen(false)}
      >
        <View style={[styles.routeModal, { backgroundColor: theme.background }]}>
          <MapCanvas region={routeRegion} style={styles.routeModalMap}>
            <Marker
              coordinate={
                pickupStop
                  ? { latitude: pickupStop.lat, longitude: pickupStop.lng }
                  : { latitude: ride.originLat, longitude: ride.originLng }
              }
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {pickupStop ? (
                <PickupPin theme={theme} />
              ) : (
                <View style={[styles.originDot, { backgroundColor: theme.accent, borderColor: theme.surface }]} />
              )}
            </Marker>
            {intermediateStops.map((stop) => (
              <Marker
                key={stop.id}
                coordinate={{ latitude: stop.lat, longitude: stop.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
              >
                <View style={[styles.stopDot, { backgroundColor: theme.surface, borderColor: theme.ink }]} />
              </Marker>
            ))}
            <Marker
              coordinate={{ latitude: dropoffLat ?? ride.destinationLat, longitude: dropoffLng ?? ride.destinationLng }}
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {dropoffStop || selectedDropoffStop ? (
                <DropoffPin theme={theme} />
              ) : (
                <View style={[styles.destDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
              )}
            </Marker>
            {segmentCoordinates.length > 1 ? (
              <Polyline coordinates={segmentCoordinates} strokeColor={theme.ink} strokeWidth={4} />
            ) : null}
          </MapCanvas>
          <TouchableOpacity
            style={[styles.routeModalClose, { top: insets.top + spacing.sm, backgroundColor: theme.surface }]}
            onPress={() => setRouteModalOpen(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.close')}
          >
            <Ionicons name="close" size={22} color={theme.ink} />
          </TouchableOpacity>
        </View>
      </Modal>

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
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  scrollContent: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  summaryPriceCol: {
    alignItems: 'flex-end',
  },
  mapCard: {
    position: 'relative',
  },
  mapCanvas: {
    height: 160,
  },
  mapValuesBadge: {
    position: 'absolute',
    left: spacing.sm,
    top: spacing.sm,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  mapValuesText: {
    fontWeight: '600',
  },
  viewRouteBtn: {
    position: 'absolute',
    right: spacing.sm,
    bottom: spacing.sm,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
  },
  timeline: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  timelineRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  timelineRoleRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
  },
  timelineRowLast: {
    paddingBottom: 0,
  },
  timelineMarkerCol: {
    width: 12,
    alignItems: 'center',
  },
  timelineDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  timelineDotOpen: {
    borderWidth: 2,
    backgroundColor: 'transparent',
  },
  timelineDotStop: {
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 2,
    backgroundColor: 'transparent',
    marginTop: 2,
  },
  timelineDotFilled: {},
  timelineLine: {
    flex: 1,
    width: 2,
    marginVertical: 4,
  },
  timelineTextCol: {
    flex: 1,
    paddingBottom: spacing.md,
    gap: 2,
  },
  stopDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  driverCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  driverTextCol: {
    flex: 1,
    gap: 2,
  },
  driverNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  driverStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  vehicleCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
  },
  vehicleIconWrap: {
    width: 44,
    height: 44,
    borderRadius: radii.lg,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  passengersSection: {
    gap: spacing.sm,
  },
  passengersTitle: {
    letterSpacing: 0.6,
    fontWeight: '700',
  },
  card: {
    borderRadius: radii.xl,
    borderWidth: 1,
    overflow: 'hidden',
  },
  passengerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
  },
  passengerName: {
    flex: 1,
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
  cta: {
    width: '100%',
    borderRadius: radii.full,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  ctaDisabled: {
    opacity: 0.4,
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
  originDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
  destDot: {
    width: 16,
    height: 16,
    borderRadius: 8,
    borderWidth: 2,
  },
});
