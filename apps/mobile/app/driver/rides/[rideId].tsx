import { useCallback, useEffect, useState } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, ActivityIndicator, Modal } from 'react-native';
import { Marker, Polyline } from 'react-native-maps';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { router, useLocalSearchParams } from 'expo-router';
import type { SupportedLocale } from '@vaya/config';
import {
  Text,
  Icon,
  Avatar,
  Badge,
  Button,
  MapPreview,
  MapCanvas,
  PickupPin,
  DropoffPin,
  PassengerStopPin,
  useAppTheme,
  useToast,
  spacing,
  radii,
  haptics,
  regionForPoints,
} from '@vaya/design-system';
import {
  useGetRideQuery,
  useGetRideStopsQuery,
  useListRequestsForRideQuery,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
  useGetTripByBookingQuery,
  useStartTripMutation,
  useConfirmPassengerAboardMutation,
  useCompleteTripMutation,
  type Booking,
  type Trip,
  type TripStatus,
} from '../../../src/state/api';
import { decodePolyline, routeOrderFraction, haversineKm, sliceRouteBetween } from '../../../src/utils/polyline';
import { DriverBookingDetailSheet } from '../../../src/features/driver-rides/DriverBookingDetailSheet';
import { RequestDetailSheet } from '../../../src/features/driver-rides/RequestDetailSheet';
import { ManageRideSheet } from '../../../src/features/driver-rides/ManageRideSheet';
import { useDriverLocationBroadcast } from '../../../src/features/driver-rides/useDriverLocationBroadcast';
import { trackEvent } from '../../../src/services/analytics/analytics';
import { estimateArrivalLabel, computeTripPhase } from '../../../src/features/driver-rides/myRidesHelpers';
import { buildItineraryThread, type ItineraryStopEvent } from '../../../src/features/driver-rides/itineraryThread';
import { PassengerItineraryThread } from '../../../src/features/driver-rides/PassengerItineraryThread';
import { formatTime, formatRelativeTime, toIntlTag } from '../../../src/utils/localeFormat';

const TRACKABLE_TRIP_STATUSES: readonly TripStatus[] = ['driver_approaching', 'pickup', 'active', 'arriving'];
// M-099/M-100 (docs/unified_driver_and_passenger_journey.md §35): the API
// now also accepts location updates for a `scheduled` trip (see
// trips.service.ts's TRACKABLE_STATUSES) so evaluateAutoStart's real
// origin-proximity/movement signals have GPS to act on — but broadcasting
// days before departure would track a driver going about unrelated errands.
// Gated to a lead window before the ride's own departureAt: real evidence
// can only start accumulating once the trip is actually imminent.
const AUTO_START_BROADCAST_LEAD_MINUTES = 30;
const TRIP_STATUS_LABEL_KEY: Partial<Record<TripStatus, string>> = {
  driver_approaching: 'rides.rideDetail.tripStatus.driverApproaching',
  pickup: 'rides.rideDetail.tripStatus.pickup',
  active: 'rides.rideDetail.tripStatus.active',
  arriving: 'rides.rideDetail.tripStatus.arriving',
  completed: 'rides.rideDetail.tripStatus.completed',
};

type ThemeColors = ReturnType<typeof useAppTheme>['colors'];

/** One pending request row — real passenger identity, seats, pickup point,
 *  and the same Accepter/Refuser mutations RideRequestsSheet already uses,
 *  now inline in the trip hub rather than tucked in a sheet. */
function PendingRequestRow({
  booking,
  rideDestinationLabel,
  theme,
  locale,
  onOpenDetails,
}: {
  booking: Booking;
  rideDestinationLabel: string;
  theme: ThemeColors;
  locale: SupportedLocale;
  onOpenDetails: () => void;
}): React.JSX.Element {
  const { t } = useTranslation('driver');
  const [acceptBooking, acceptState] = useAcceptBookingMutation();
  const [declineBooking, declineState] = useDeclineBookingMutation();
  const [error, setError] = useState<string | null>(null);
  const isBusy = acceptState.isLoading || declineState.isLoading;

  async function respond(action: 'accept' | 'decline'): Promise<void> {
    setError(null);
    try {
      if (action === 'accept') await acceptBooking(booking.id).unwrap();
      else await declineBooking(booking.id).unwrap();
      haptics.success();
      trackEvent('driver_request_response', { action, source: 'ride-hub' });
    } catch {
      haptics.error();
      setError(action === 'accept' ? t('rides.requestsSheet.acceptError') : t('rides.requestsSheet.declineError'));
    }
  }

  return (
    // The whole card opens the request-detail sheet now, not just the small
    // info icon that used to be the only tappable spot in the identity row
    // — Accept/Decline stay their own nested TouchableOpacitys below, and a
    // touch starting on either of them is claimed by that inner responder
    // first (RN's standard nested-Touchable behavior), so they keep working
    // independently of this outer tap target.
    <TouchableOpacity
      style={[styles.glassRow, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}
      onPress={onOpenDetails}
      activeOpacity={0.8}
      accessibilityRole="button"
      accessibilityLabel={`${t('rides.requestsSheet.viewDetails')} — ${booking.rider?.fullName ?? ''}`}
    >
      <View style={styles.requestIdentityRow}>
        {booking.rider ? (
          <TouchableOpacity
            onPress={() =>
              router.push({
                pathname: '/search/trust',
                params: { driverUserId: booking.rider!.id, bookingId: booking.id },
              })
            }
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={t('common:actions.viewProfile', { name: booking.rider.fullName })}
          >
            <Avatar
              uri={booking.rider.avatarUrl}
              name={booking.rider.fullName}
              sizePx={40}
              fallbackBackgroundColor={theme.surface}
              fallbackTextColor={theme.ink}
            />
          </TouchableOpacity>
        ) : (
          <Avatar
            uri={undefined}
            name="?"
            sizePx={40}
            fallbackBackgroundColor={theme.surface}
            fallbackTextColor={theme.ink}
          />
        )}
        <View style={styles.requestIdentityText}>
          <Text variant="body" color={theme.ink} numberOfLines={1}>
            {booking.rider?.fullName ?? t('rides.rideDetail.passenger')}
          </Text>
          <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
            {`${booking.seatsRequested} place${booking.seatsRequested > 1 ? 's' : ''} · ${booking.pickupLabel}`}
          </Text>
          {/* This passenger's own dropoff — may not match the ride's own
           *  destination on a route-passthrough match, so the driver sees
           *  exactly where THIS rider goes before deciding, not just where
           *  the ride itself ends. */}
          <Text variant="caption" color={theme.inkFaint} numberOfLines={1}>
            {`→ ${booking.dropoffLabel ?? rideDestinationLabel}`}
          </Text>
          {/* M-054/M-059 (docs/unified_driver_and_passenger_journey.md
           *  §20/§21): the real, server-authoritative response deadline —
           *  was entirely absent from this list row before this pass, even
           *  though `booking.expiresAt` already existed. */}
          {booking.expiresAt ? (
            <Text variant="caption" color={theme.warning} numberOfLines={1}>
              {t('rides.requestDetail.respondBy', { time: formatTime(new Date(booking.expiresAt), locale) })}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-forward" size="sm" color={theme.inkFaint} />
      </View>
      <View style={styles.requestActions}>
        <TouchableOpacity
          style={[styles.pillButton, styles.pillButtonOutline, { borderColor: theme.outline }]}
          onPress={() => void respond('decline')}
          disabled={isBusy}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`${t('rides.requestsSheet.decline')} ${booking.rider?.fullName ?? ''}`}
        >
          <Text variant="label" color={theme.error}>
            {t('rides.requestsSheet.decline')}
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.pillButton, { backgroundColor: theme.accent }]}
          onPress={() => void respond('accept')}
          disabled={isBusy}
          activeOpacity={0.85}
          accessibilityRole="button"
          accessibilityLabel={`${t('rides.requestsSheet.accept')} ${booking.rider?.fullName ?? ''}`}
        >
          <Text variant="label" color={theme.onAccent}>
            {t('rides.requestsSheet.accept')}
          </Text>
        </TouchableOpacity>
      </View>
      {error ? (
        <Text variant="caption" color={theme.error} style={styles.requestError}>
          {error}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
}

/**
 * Invisible per-accepted-booking trip subscription. A ride with N accepted
 * bookings has N independent `trips` rows (one per booking) sharing one
 * driver's physical position — this lets the parent screen aggregate every
 * accepted booking's own trip without calling a variable number of hooks
 * in a loop (illegal in React). Renders nothing; reports up via callback.
 */
function AcceptedBookingTripBridge({
  bookingId,
  onTripChange,
}: {
  bookingId: string;
  onTripChange: (bookingId: string, trip: Trip | undefined) => void;
}): null {
  const { data: trip } = useGetTripByBookingQuery(bookingId);
  useEffect(() => {
    onTripChange(bookingId, trip);
  }, [bookingId, trip, onTripChange]);
  return null;
}

/**
 * Driver's real-time ride management hub (2026-08-23 trips/notifications
 * redesign) — consolidates what RideRequestsSheet + ManageRideSheet used to
 * split across two separate bottom sheets into one screen: a real route
 * preview, the ride's own facts, a glassmorphic passenger list with inline
 * accept/decline on pending requests, and a sticky "Annuler le trajet"
 * footer. Tapping an already-answered row still opens
 * DriverBookingDetailSheet (message/no-show/cancel-this-booking) — reused
 * as-is, not rebuilt.
 */
export default function DriverRideHubScreen(): React.JSX.Element {
  const { rideId } = useLocalSearchParams<{ rideId: string }>();
  const insets = useSafeAreaInsets();
  const { colors: theme, scheme } = useAppTheme();
  const { t, i18n } = useTranslation(['driver', 'booking', 'common']);
  const locale = i18n.language as SupportedLocale;
  const intlTag = toIntlTag(locale);
  const [managedBooking, setManagedBooking] = useState<Booking | null>(null);
  const [detailBooking, setDetailBooking] = useState<Booking | null>(null);

  const ANSWERED_BADGE: Record<Booking['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
    pending: { label: t('rides.requestsSheet.sectionPending'), variant: 'warning' },
    accepted: { label: t('rides.rideDetail.confirmedBadge'), variant: 'success' },
    declined: { label: t('rides.requestsSheet.decline'), variant: 'error' },
    cancelled_by_rider: { label: t('rides.rideDetail.cancelRide'), variant: 'default' },
    cancelled_by_driver: { label: t('rides.rideDetail.cancelRide'), variant: 'error' },
    expired: { label: t('rides.requestsSheet.empty'), variant: 'default' },
    completed: { label: t('rides.rideDetail.arrival'), variant: 'default' },
    no_show: { label: t('rides.requestsSheet.empty'), variant: 'error' },
  };
  const [cancellingRide, setCancellingRide] = useState(false);
  const [routeModalOpen, setRouteModalOpen] = useState(false);

  const { data: ride, isLoading: isRideLoading } = useGetRideQuery(rideId);
  const { data: requests, isLoading: isRequestsLoading } = useListRequestsForRideQuery(rideId);
  const { data: stops } = useGetRideStopsQuery(rideId);

  const pending = (requests ?? []).filter((r) => r.status === 'pending');
  const answered = (requests ?? []).filter((r) => r.status !== 'pending');
  const acceptedBookings = answered.filter((b) => b.status === 'accepted');

  // Live tracking (docs/domain/live-tracking.md): the driver's three real
  // actions (Démarrer/Passager à bord/Terminer) plus foreground GPS
  // broadcast — all hooks called unconditionally here, before either early
  // return below, per React's rules of hooks.
  const [tripsByBooking, setTripsByBooking] = useState<Record<string, Trip | undefined>>({});
  const handleTripChange = useCallback((bookingId: string, trip: Trip | undefined) => {
    setTripsByBooking((prev) => (prev[bookingId] === trip ? prev : { ...prev, [bookingId]: trip }));
  }, []);
  const acceptedTrips = acceptedBookings
    .map((b) => tripsByBooking[b.id])
    .filter((trip): trip is Trip => Boolean(trip));
  const scheduledTripIds = acceptedTrips.filter((trip) => trip.status === 'scheduled').map((trip) => trip.id);
  // Re-ticks every 30s purely so `trackableTripIds` (and therefore the GPS
  // broadcast hook below) re-evaluates as departure becomes imminent, even
  // if nothing else on this screen would otherwise trigger a re-render.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNowTick(Date.now()), 30_000);
    return () => clearInterval(interval);
  }, []);
  const departureImminent =
    Boolean(ride) &&
    nowTick >= new Date(ride!.departureAt).getTime() - AUTO_START_BROADCAST_LEAD_MINUTES * 60_000;
  const trackableTripIds = acceptedTrips
    .filter(
      (trip) =>
        TRACKABLE_TRIP_STATUSES.includes(trip.status) || (trip.status === 'scheduled' && departureImminent),
    )
    .map((trip) => trip.id);
  const completableTripIds = acceptedTrips
    .filter((trip) => trip.status === 'active' || trip.status === 'arriving')
    .map((trip) => trip.id);
  const anyNotYetCompletable = acceptedTrips.some(
    (trip) => trip.status === 'scheduled' || trip.status === 'driver_approaching' || trip.status === 'pickup',
  );
  const canStartJourney = scheduledTripIds.length > 0;
  const canCompleteJourney = completableTripIds.length > 0 && !anyNotYetCompletable;

  const { status: locationBroadcastStatus, retryPermission: retryLocationPermission } =
    useDriverLocationBroadcast(trackableTripIds);

  const [startTrip] = useStartTripMutation();
  const [confirmPassengerAboard] = useConfirmPassengerAboardMutation();
  const [completeTripMutation] = useCompleteTripMutation();
  const [journeyActionBusy, setJourneyActionBusy] = useState(false);
  const showToast = useToast();

  async function handleStartJourney(): Promise<void> {
    setJourneyActionBusy(true);
    const results = await Promise.allSettled(scheduledTripIds.map((id) => startTrip(id).unwrap()));
    setJourneyActionBusy(false);
    if (results.some((r) => r.status === 'rejected')) {
      showToast({ message: t('rides.rideDetail.journeyStartPartialError'), tone: 'error' });
    } else {
      haptics.success();
      trackEvent('driver_journey_started', { rideId });
    }
  }

  async function handleCompleteJourney(): Promise<void> {
    setJourneyActionBusy(true);
    const results = await Promise.allSettled(completableTripIds.map((id) => completeTripMutation(id).unwrap()));
    setJourneyActionBusy(false);
    if (results.some((r) => r.status === 'rejected')) {
      showToast({ message: t('rides.rideDetail.journeyCompletePartialError'), tone: 'error' });
    } else {
      haptics.success();
      trackEvent('driver_journey_completed', { rideId });
    }
  }

  async function handlePassengerAboard(tripId: string): Promise<void> {
    try {
      await confirmPassengerAboard(tripId).unwrap();
      haptics.success();
      trackEvent('driver_passenger_aboard', { rideId, tripId });
    } catch {
      showToast({ message: t('rides.rideDetail.passengerAboardError'), tone: 'error' });
    }
  }

  const routeCoordinates = ride?.routePolyline ? decodePolyline(ride.routePolyline) : [];
  // Only the driver-selected stops (the endpoint already filters to these —
  // see getRideStops's own comment), in route order. The publish flow
  // confirms exactly a pickup then a dropoff, so 2 real stops is the normal
  // case; older rides published before that flow existed may have more (or
  // none, if the driver picked no additional stops at all — a valid ride,
  // nothing to show here then).
  const selectedStops = [...(stops ?? [])].sort((a, b) => a.sequence - b.sequence);
  const arrivalLabel = ride
    ? estimateArrivalLabel(ride.departureAt, ride.estimatedDurationSec, intlTag)
    : null;
  // The map's premium pickup/dropoff pins only make sense for the normal
  // exactly-2-stops shape (same rule the "Points de rendez-vous" section
  // below uses for role labels) — anything else falls back to MapPreview's
  // plain origin/destination dots rather than guessing which of >2 stops
  // is "the" pickup or dropoff.
  const pickupStop = selectedStops.length === 2 ? selectedStops[0] : undefined;
  const dropoffStop = selectedStops.length === 2 ? selectedStops[1] : undefined;
  // Any stop that isn't the pickup or dropoff endpoint — only possible on a
  // legacy ride published before this flow narrowed the driver to exactly
  // one pickup + one dropoff. Shown as neutral waypoints on the fullscreen
  // map, same convention as the passenger's ride-details.tsx.
  const intermediateStops = selectedStops.slice(1, -1);

  // Real UX gap found live: an accepted passenger whose own pickup/dropoff
  // isn't the ride's own origin/destination (a route-passthrough or
  // detour-match booking — e.g. a Zaragoza -> Lleida request on a Madrid ->
  // Barcelona ride) was invisible on this screen entirely, both in the
  // itinerary text and on the map — a driver had no way to tell a specific
  // passenger's own stop apart from their own route at all. Built from
  // real accepted-booking data (pickupLat/Lng/Label, dropoffLat/Lng/Label),
  // never fabricated: a point within 300m of the ride's own origin/
  // destination is treated as "the same point" and skipped (already shown
  // by the Departure/Arrival rows below), not duplicated. `fraction` (this
  // file's own utils/polyline.ts routeOrderFraction, display-only — not the
  // server's precise matching-decision projection) both orders multiple
  // passengers' points correctly along the route and derives an honest,
  // real-route-geometry-based ETA for each, the same "duration * fraction"
  // approximation matching.service.ts's own route_passthrough tier already
  // uses server-side.
  const DISTINCT_FROM_ENDPOINT_KM = 0.3;
  const passengerItineraryPoints = ride
    ? acceptedBookings
        .flatMap((booking) => {
          const passengerName = booking.rider?.fullName ?? t('rides.bookingDetail.passenger');
          const points: ItineraryStopEvent[] = [];

          function etaAt(fraction: number): string | null {
            if (ride!.estimatedDurationSec == null) return null;
            return estimateArrivalLabel(
              ride!.departureAt,
              Math.round(ride!.estimatedDurationSec * fraction),
              intlTag,
            );
          }

          const originLatLng = { latitude: ride!.originLat, longitude: ride!.originLng };
          const pickupLatLng = { latitude: booking.pickupLat, longitude: booking.pickupLng };
          if (haversineKm(pickupLatLng, originLatLng) * 1000 > DISTINCT_FROM_ENDPOINT_KM * 1000) {
            const fraction = routeCoordinates.length > 1 ? routeOrderFraction(routeCoordinates, pickupLatLng) : 0;
            points.push({
              bookingId: booking.id,
              kind: 'pickup',
              lat: booking.pickupLat,
              lng: booking.pickupLng,
              label: booking.pickupLabel,
              passengerName,
              avatarUrl: booking.rider?.avatarUrl ?? null,
              riderId: booking.rider?.id ?? null,
              seatsRequested: booking.seatsRequested,
              fraction,
              timeLabel: etaAt(fraction),
            });
          }

          const dropoffLat = booking.dropoffLat ?? ride!.destinationLat;
          const dropoffLng = booking.dropoffLng ?? ride!.destinationLng;
          const destinationLatLng = { latitude: ride!.destinationLat, longitude: ride!.destinationLng };
          const dropoffLatLng = { latitude: dropoffLat, longitude: dropoffLng };
          if (haversineKm(dropoffLatLng, destinationLatLng) * 1000 > DISTINCT_FROM_ENDPOINT_KM * 1000) {
            const fraction = routeCoordinates.length > 1 ? routeOrderFraction(routeCoordinates, dropoffLatLng) : 1;
            points.push({
              bookingId: booking.id,
              kind: 'dropoff',
              lat: dropoffLat,
              lng: dropoffLng,
              label: booking.dropoffLabel ?? ride!.destinationLabel,
              passengerName,
              avatarUrl: booking.rider?.avatarUrl ?? null,
              riderId: booking.rider?.id ?? null,
              seatsRequested: booking.seatsRequested,
              fraction,
              timeLabel: etaAt(fraction),
            });
          }

          return points;
        })
        .sort((a, b) => a.fraction - b.fraction)
    : [];

  // The threaded itinerary (2026-08-31 overlap-clarity fix,
  // docs/domain/ride-engine.md): turns the same real, route-order-sorted
  // points above into an origin->events->destination node thread plus a
  // per-leg onboard-seat count, so two overlapping passengers (one picked
  // up before the other is dropped off) are visible as a real "car is
  // fuller here" signal instead of two indistinguishable rows in a flat
  // list. See itineraryThread.ts's own doc comment for the full rationale.
  const itineraryThread = ride
    ? buildItineraryThread(
        {
          lat: ride.originLat,
          lng: ride.originLng,
          label: ride.originLabel,
          timeLabel: formatTime(new Date(ride.departureAt), locale),
          subLabel:
            pickupStop && pickupStop.label !== ride.originLabel
              ? `${t('common:terms.pickup')} · ${pickupStop.label}`
              : undefined,
        },
        {
          lat: ride.destinationLat,
          lng: ride.destinationLng,
          label: ride.destinationLabel,
          timeLabel: arrivalLabel,
          subLabel:
            dropoffStop && dropoffStop.label !== ride.destinationLabel
              ? `${t('common:terms.dropoff')} · ${dropoffStop.label}`
              : undefined,
        },
        passengerItineraryPoints,
      )
    : null;

  // Same per-leg onboard-seat counts, now sliced against the real decoded
  // route geometry (utils/polyline.ts's sliceRouteBetween — already used
  // elsewhere in this app for a sub-trip's own segment) so the map's route
  // line can be colored/dashed exactly like the itinerary thread reads:
  // solid where passengers are aboard, dashed on an empty leg, heavier
  // still when two or more are aboard at once.
  const occupancySegments =
    itineraryThread && routeCoordinates.length > 1
      ? (() => {
          const nodesByKey = new Map(itineraryThread.nodes.map((n) => [n.key, n]));
          return itineraryThread.segments.map((segment) => {
            const from = nodesByKey.get(segment.fromKey)!;
            const to = nodesByKey.get(segment.toKey)!;
            return {
              coordinates: sliceRouteBetween(
                routeCoordinates,
                { latitude: from.lat, longitude: from.lng },
                { latitude: to.lat, longitude: to.lng },
              ),
              onboardSeats: segment.onboardSeats,
            };
          });
        })()
      : undefined;

  if (isRideLoading) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <ActivityIndicator size="large" color={theme.accent} />
      </View>
    );
  }

  if (!ride) {
    return (
      <View style={[styles.loadingWrap, { backgroundColor: theme.background }]}>
        <Text variant="body" color={theme.inkFaint}>
          {t('rides.rideDetail.rideNotFound')}
        </Text>
      </View>
    );
  }

  const cancellable = ['draft', 'published', 'full'].includes(ride.status);
  // Status pill (2026-08-27 itinerary redesign): replaces a badge that used
  // to show the literal word "Departure" for the ride's entire lifetime
  // (draft/published/full/in_progress all showed "Departure", only the
  // color changed) with something reflecting where the trip actually is —
  // see computeTripPhase's own doc comment: `in_progress`/`completed` are
  // now real signals from live tracking (docs/domain/live-tracking.md) when
  // present, with a departure-time heuristic as a narrower fallback only
  // for the window before any accepted booking's trip has started.
  const tripPhase = computeTripPhase(ride);
  const statusBadge: { label: string; variant: 'default' | 'success' | 'info' | 'warning' | 'error' } =
    tripPhase === 'cancelled'
      ? { label: t('common:terms.cancelled'), variant: 'error' }
      : tripPhase === 'completed'
        ? { label: t('rides.rideDetail.finished'), variant: 'info' }
        : tripPhase === 'in_progress'
          ? {
              label: arrivalLabel
                ? t('rides.rideDetail.startedWithEta', { time: arrivalLabel })
                : t('rides.rideDetail.started'),
              variant: 'warning',
            }
          : {
              label: t('rides.rideDetail.departsIn', {
                relative: formatRelativeTime(new Date(ride.departureAt), locale),
              }),
              variant: 'success',
            };
  // Real revenue insight for the driver — summed from actually-accepted
  // bookings' own contributionTotal (which already accounts for seat count),
  // never seatsTotal × price, so a partially-filled ride never overstates
  // what's actually confirmed.
  const confirmedBookings = answered.filter((b) => b.status === 'accepted');
  const confirmedRevenue = confirmedBookings.reduce((sum, b) => sum + b.contributionTotal, 0);
  const fullRouteRegion =
    regionForPoints([
      pickupStop ?? { lat: ride.originLat, lng: ride.originLng },
      ...intermediateStops,
      ...passengerItineraryPoints.map((p) => ({ lat: p.lat, lng: p.lng })),
      dropoffStop ?? { lat: ride.destinationLat, lng: ride.destinationLng },
    ]) ?? undefined;

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {acceptedBookings.map((booking) => (
        <AcceptedBookingTripBridge key={booking.id} bookingId={booking.id} onTripChange={handleTripChange} />
      ))}
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollContent}>
        <View style={[styles.header, { paddingTop: insets.top + spacing.sm }]}>
          <TouchableOpacity
            onPress={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/trips'))}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('rides.rideDetail.back')}
          >
            <Ionicons name="chevron-back" size={24} color={theme.ink} />
          </TouchableOpacity>
          <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
            {t('rides.rideDetail.myRide')}
          </Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.mapCard}>
          <MapPreview
            height={160}
            origin={{ latitude: ride.originLat, longitude: ride.originLng }}
            destination={{ latitude: ride.destinationLat, longitude: ride.destinationLng }}
            pickup={pickupStop ? { latitude: pickupStop.lat, longitude: pickupStop.lng } : undefined}
            dropoff={dropoffStop ? { latitude: dropoffStop.lat, longitude: dropoffStop.lng } : undefined}
            passengerStops={passengerItineraryPoints.map((p) => ({ lat: p.lat, lng: p.lng, kind: p.kind }))}
            theme={theme}
            isDark={scheme === 'dark'}
            routeCoordinates={routeCoordinates}
            occupancySegments={occupancySegments}
            style={styles.map}
          />
          {/* The preview thumbnail is deliberately non-interactive (same as
           *  every MapPreview elsewhere) — this is the way in to a real,
           *  pannable/zoomable view of the whole route, matching the
           *  passenger's own ride-details.tsx "Voir l'itinéraire" pattern.
           *  Top-center, not bottom-right — matches the Stitch-reviewed
           *  reference; centered over the route reads as "expand this map"
           *  more clearly than a corner-anchored pill competing with the
           *  pickup/dropoff pins below it. */}
          <View style={styles.viewRouteBtnWrap} pointerEvents="box-none">
            <TouchableOpacity
              style={[styles.viewRouteBtn, { backgroundColor: theme.surface }]}
              onPress={() => setRouteModalOpen(true)}
              activeOpacity={0.85}
              accessibilityRole="button"
              accessibilityLabel={t('rides.rideDetail.viewRouteFullscreen')}
            >
              <Icon name="expand-outline" size="xs" color={theme.ink} />
              <Text variant="caption" color={theme.ink}>
                {t('rides.rideDetail.viewRouteFullscreen')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Capacity & earnings summary bar (2026-08-31 itinerary redesign):
         *  replaces 3 stacked icon+text fact rows with a single glanceable
         *  two-stat card directly under the map — a real seat-by-seat fill
         *  indicator instead of only a "2/3" number, and the confirmed
         *  amount next to what the ride could still earn if it fills up,
         *  instead of two disconnected lines. */}
        <View style={[styles.statsBar, { backgroundColor: theme.surfaceMuted }]}>
          <View style={styles.statsCol}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('rides.rideDetail.capacityLabel')}
            </Text>
            <View style={styles.seatPipsRow}>
              {Array.from({ length: ride.seatsTotal }).map((_, i) => (
                <View
                  key={i}
                  style={[
                    styles.seatPip,
                    { backgroundColor: i < ride.seatsTotal - ride.seatsAvailable ? theme.accent : theme.outlineVariant },
                  ]}
                />
              ))}
            </View>
            <Text variant="bodySmall" color={theme.ink} numberOfLines={1}>
              {t('rides.rideDetail.seatsBooked', { booked: ride.seatsTotal - ride.seatsAvailable, total: ride.seatsTotal })}
            </Text>
          </View>
          <View style={[styles.statsDivider, { backgroundColor: theme.outlineVariant }]} />
          <View style={styles.statsCol}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('rides.rideDetail.earningsLabel')}
            </Text>
            <Text variant="bodySmall" color={theme.ink} numberOfLines={1} style={styles.boldStat}>
              {confirmedBookings.length > 0
                ? t('rides.rideDetail.confirmedAmount', { revenue: confirmedRevenue })
                : t('rides.rideDetail.pricePerSeat', { price: ride.contributionPerSeat })}
            </Text>
            <View style={[styles.maxRevenuePill, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
              <Text variant="caption" color={theme.inkFaint} numberOfLines={1}>
                {t('rides.rideDetail.maxPotentialRevenue', { max: ride.contributionPerSeat * ride.seatsTotal })}
              </Text>
            </View>
          </View>
        </View>

        <View style={[styles.infoCard, { backgroundColor: theme.surface, borderColor: theme.outlineVariant }]}>
          <View style={styles.infoTitleRow}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('rides.rideDetail.itinerary')}
            </Text>
            <Badge label={statusBadge.label} variant={statusBadge.variant} theme={theme} />
          </View>

          {intermediateStops.length > 0 ? (
            <Text variant="caption" color={theme.inkFaint} style={styles.compactStopsNote}>
              {t('rides.rideDetail.intermediateStopsNote', { count: intermediateStops.length })}
            </Text>
          ) : null}

          {/* The threaded itinerary (see itineraryThread.ts's doc comment):
           *  origin, each real accepted passenger's own pickup/dropoff in
           *  real route order, destination — each leg's connector colored
           *  and weighted by how many seats are actually occupied on it,
           *  and an inline tag the moment a second passenger boards while
           *  the first is still aboard. Replaces the old flat compactStop
           *  rows, which showed the same real points but no overlap
           *  signal at all. */}
          {itineraryThread ? (
            <PassengerItineraryThread
              thread={itineraryThread}
              seatsTotal={ride.seatsTotal}
              theme={theme}
              originEyebrow={t('rides.rideDetail.departure')}
              destinationEyebrow={t('rides.rideDetail.arrival')}
              pickupPrefix={t('rides.rideDetail.pickupPrefix')}
              dropoffPrefix={t('rides.rideDetail.dropoffPrefix')}
              onboardRangeTemplate={(from, to) => t('rides.rideDetail.onboardRange', { from, to })}
              occupancyTagTemplate={(seats, total) => t('rides.rideDetail.occupancyTag', { seats, total })}
              onPressPassenger={({ riderId, bookingId }) =>
                router.push({ pathname: '/search/trust', params: { driverUserId: riderId, bookingId } })
              }
            />
          ) : null}
        </View>

        <View style={styles.section}>
          <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
            {t('rides.rideDetail.pendingSection', { count: pending.length })}
          </Text>
          {isRequestsLoading ? (
            <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
          ) : pending.length === 0 ? (
            <Text variant="bodySmall" color={theme.inkFaint} style={styles.emptyHint}>
              {t('rides.rideDetail.noPendingRequests')}
            </Text>
          ) : (
            pending.map((booking) => (
              <PendingRequestRow
                key={booking.id}
                booking={booking}
                rideDestinationLabel={ride.destinationLabel}
                theme={theme}
                locale={locale}
                onOpenDetails={() => setDetailBooking(booking)}
              />
            ))
          )}
        </View>

        {answered.length > 0 ? (
          <View style={styles.section}>
            <Text variant="label" color={theme.inkMuted} style={styles.sectionHeading}>
              {t('rides.rideDetail.passengers')}
            </Text>
            {answered.map((booking) => {
              const meta = ANSWERED_BADGE[booking.status];
              const manageable = booking.status === 'accepted';
              const trip = tripsByBooking[booking.id];
              // Once this passenger's own trip has genuinely started, its
              // real status is more useful than the generic "Confirmé"
              // badge every accepted booking otherwise shows forever.
              const tripStatusKey = trip ? TRIP_STATUS_LABEL_KEY[trip.status] : undefined;
              const badgeLabel = tripStatusKey ? t(tripStatusKey) : meta.label;
              const showBoardButton = trip && (trip.status === 'driver_approaching' || trip.status === 'pickup');
              return (
                <View key={booking.id} style={styles.answeredGroup}>
                  <TouchableOpacity
                    style={[styles.glassRow, styles.answeredRow, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}
                    disabled={!manageable}
                    onPress={manageable ? () => setManagedBooking(booking) : undefined}
                    activeOpacity={0.7}
                    accessibilityRole={manageable ? 'button' : undefined}
                    accessibilityLabel={
                      manageable ? `${t('rides.manageSheet.title')} ${booking.rider?.fullName ?? t('rides.bookingDetail.passenger')}` : undefined
                    }
                  >
                    {booking.rider ? (
                      <TouchableOpacity
                        onPress={() =>
                          router.push({
                            pathname: '/search/trust',
                            params: { driverUserId: booking.rider!.id, bookingId: booking.id },
                          })
                        }
                        hitSlop={6}
                        accessibilityRole="button"
                        accessibilityLabel={t('common:actions.viewProfile', { name: booking.rider.fullName })}
                      >
                        <Avatar
                          uri={booking.rider.avatarUrl}
                          name={booking.rider.fullName}
                          sizePx={36}
                          fallbackBackgroundColor={theme.surface}
                          fallbackTextColor={theme.ink}
                        />
                      </TouchableOpacity>
                    ) : (
                      <Avatar
                        uri={undefined}
                        name="?"
                        sizePx={36}
                        fallbackBackgroundColor={theme.surface}
                        fallbackTextColor={theme.ink}
                      />
                    )}
                    <View style={styles.requestIdentityText}>
                      <Text variant="bodySmall" color={theme.ink} numberOfLines={1}>
                        {booking.rider?.fullName ?? t('rides.bookingDetail.passenger')}
                      </Text>
                      <Text variant="caption" color={theme.inkMuted}>
                        {`${booking.seatsRequested} place${booking.seatsRequested > 1 ? 's' : ''}`}
                      </Text>
                    </View>
                    <Badge label={badgeLabel} variant={meta.variant} theme={theme} />
                    {manageable ? <Icon name="chevron-forward" size="xs" color={theme.outline} /> : null}
                  </TouchableOpacity>
                  {showBoardButton ? (
                    <TouchableOpacity
                      style={[styles.boardButton, { backgroundColor: theme.accent }]}
                      onPress={() => void handlePassengerAboard(trip!.id)}
                      activeOpacity={0.85}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('rides.rideDetail.passengerAboard')} ${booking.rider?.fullName ?? ''}`}
                    >
                      <Text variant="label" color={theme.onAccent}>
                        {t('rides.rideDetail.passengerAboard')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              );
            })}
          </View>
        ) : null}

        <View style={styles.scrollSpacer} />
      </ScrollView>

      {locationBroadcastStatus === 'permission_denied' ? (
        <View style={[styles.permissionBanner, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}>
          <Icon name="location-outline" size="sm" color={theme.error} />
          <Text variant="bodySmall" color={theme.ink} style={styles.permissionBannerText}>
            {t('rides.rideDetail.locationPermissionBanner')}
          </Text>
          <Button
            theme={theme}
            label={t('rides.rideDetail.locationPermissionRetry')}
            variant="ghost"
            size="sm"
            onPress={retryLocationPermission}
          />
        </View>
      ) : null}

      {cancellable || canStartJourney || canCompleteJourney ? (
        <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md, backgroundColor: theme.background, borderTopColor: theme.outlineVariant }]}>
          {canStartJourney ? (
            <Button
              label={t('rides.rideDetail.journeyStartCta')}
              theme={theme}
              disabled={journeyActionBusy}
              onPress={() => void handleStartJourney()}
              style={styles.footerButton}
            />
          ) : null}
          {canCompleteJourney ? (
            <Button
              label={t('rides.rideDetail.journeyCompleteCta')}
              theme={theme}
              disabled={journeyActionBusy}
              onPress={() => void handleCompleteJourney()}
              style={styles.footerButton}
            />
          ) : null}
          {cancellable ? (
            <Button
              label={t('rides.rideDetail.cancelRide')}
              variant="outline"
              theme={theme}
              onPress={() => setCancellingRide(true)}
              style={styles.footerButton}
            />
          ) : null}
        </View>
      ) : null}

      <Modal
        visible={routeModalOpen}
        animationType="slide"
        onRequestClose={() => setRouteModalOpen(false)}
      >
        <View style={[styles.routeModal, { backgroundColor: theme.background }]}>
          <MapCanvas region={fullRouteRegion} style={styles.routeModalMap}>
            {/* Same per-leg onboard-seat coloring as the map preview above
             *  (occupancySegments) — a driver expanding to the fullscreen
             *  route sees the exact same "how full is the car here" signal,
             *  not a flat single-color line. */}
            {occupancySegments && occupancySegments.length > 0
              ? occupancySegments.map((segment, i) => (
                  <Polyline
                    key={`occupancy-${i}`}
                    coordinates={segment.coordinates}
                    strokeColor={
                      segment.onboardSeats === 0
                        ? theme.outline
                        : segment.onboardSeats === 1
                          ? theme.accent
                          : theme.accentStrong
                    }
                    strokeWidth={segment.onboardSeats >= 2 ? 6 : segment.onboardSeats === 1 ? 5 : 4}
                    lineDashPattern={segment.onboardSeats === 0 ? [8, 8] : undefined}
                  />
                ))
              : routeCoordinates.length > 1
                ? <Polyline coordinates={routeCoordinates} strokeColor={theme.ink} strokeWidth={4} />
                : null}
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
                <View style={[styles.waypointDot, { backgroundColor: theme.surface, borderColor: theme.ink }]} />
              </Marker>
            ))}
            {passengerItineraryPoints.map((point) => (
              <Marker
                key={`${point.kind}-${point.passengerName}-${point.lat}-${point.lng}`}
                coordinate={{ latitude: point.lat, longitude: point.lng }}
                anchor={{ x: 0.5, y: 0.5 }}
                zIndex={10}
              >
                <PassengerStopPin theme={theme} kind={point.kind} />
              </Marker>
            ))}
            <Marker
              coordinate={
                dropoffStop
                  ? { latitude: dropoffStop.lat, longitude: dropoffStop.lng }
                  : { latitude: ride.destinationLat, longitude: ride.destinationLng }
              }
              anchor={{ x: 0.5, y: 0.5 }}
            >
              {dropoffStop ? (
                <DropoffPin theme={theme} />
              ) : (
                <View style={[styles.destDot, { backgroundColor: theme.ink, borderColor: theme.surface }]} />
              )}
            </Marker>
          </MapCanvas>
          <TouchableOpacity
            style={[styles.routeModalClose, { top: insets.top + spacing.sm, backgroundColor: theme.surface }]}
            onPress={() => setRouteModalOpen(false)}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={t('rides.rideDetail.close')}
          >
            <Ionicons name="close" size={22} color={theme.ink} />
          </TouchableOpacity>
        </View>
      </Modal>

      <DriverBookingDetailSheet
        visible={!!managedBooking}
        booking={managedBooking}
        rideDestinationLabel={ride.destinationLabel}
        onClose={() => setManagedBooking(null)}
      />
      <RequestDetailSheet
        visible={detailBooking !== null}
        booking={detailBooking}
        routePolyline={ride.routePolyline}
        onClose={() => setDetailBooking(null)}
      />
      <ManageRideSheet
        visible={cancellingRide}
        ride={ride}
        onClose={() => setCancellingRide(false)}
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
  scrollContent: {
    paddingBottom: spacing.xl,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  headerSpacer: {
    width: 24,
  },
  mapCard: {
    position: 'relative',
    marginHorizontal: spacing.lg,
  },
  map: {},
  // A full-width, non-interactive wrapper that only centers its child —
  // `alignItems: 'center'` on a real flex parent, not a fixed-width
  // manual-offset hack, so this stays correctly centered regardless of
  // how wide the button's translated label renders in any locale.
  viewRouteBtnWrap: {
    position: 'absolute',
    top: spacing.sm,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  viewRouteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: radii.full,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.xs,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 2,
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
  waypointDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  infoCard: {
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  infoTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  compactStopsNote: {
    marginLeft: spacing.lg,
  },
  statsBar: {
    flexDirection: 'row',
    marginHorizontal: spacing.lg,
    marginTop: spacing.md,
    borderRadius: radii.xl,
    overflow: 'hidden',
  },
  statsCol: {
    flex: 1,
    padding: spacing.md,
    gap: 6,
  },
  statsDivider: {
    width: StyleSheet.hairlineWidth,
  },
  seatPipsRow: {
    flexDirection: 'row',
    gap: 4,
  },
  seatPip: {
    width: 16,
    height: 8,
    borderRadius: 4,
  },
  boldStat: {
    fontWeight: '700',
  },
  maxRevenuePill: {
    alignSelf: 'flex-start',
    borderRadius: radii.full,
    borderWidth: 1,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
  },
  section: {
    paddingHorizontal: spacing.lg,
    marginTop: spacing.lg,
    gap: spacing.sm,
  },
  sectionHeading: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  loading: {
    marginTop: spacing.sm,
  },
  emptyHint: {
    paddingVertical: spacing.sm,
  },
  glassRow: {
    borderRadius: radii.xl,
    borderWidth: 1,
    padding: spacing.md,
    gap: spacing.sm,
  },
  requestIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  requestIdentityText: {
    flex: 1,
    gap: 1,
  },
  requestActions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  pillButton: {
    flex: 1,
    borderRadius: radii.full,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pillButtonOutline: {
    borderWidth: 1,
  },
  requestError: {
    textAlign: 'center',
  },
  answeredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  answeredGroup: {
    gap: spacing.xs,
  },
  boardButton: {
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollSpacer: {
    height: spacing['3xl'],
  },
  permissionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    borderRadius: radii.lg,
    borderWidth: 1,
    padding: spacing.sm,
  },
  permissionBannerText: {
    flex: 1,
  },
  footer: {
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  footerButton: {
    width: '100%',
  },
});
