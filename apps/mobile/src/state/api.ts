import { createApi, fetchBaseQuery, type BaseQueryFn } from '@reduxjs/toolkit/query/react';
import type { FetchArgs, FetchBaseQueryError } from '@reduxjs/toolkit/query/react';
import Constants from 'expo-constants';
import type {
  RequestOtpInput,
  VerifyOtpInput,
  AuthTokens,
  CreateDriverOnboardingInput,
  UpdateVehicleInput,
  CreateRideInput,
  UpdateRideInput,
  CreateBookingInput,
  NotifyMeInput,
  UpdateRecurringPatternInput,
  UpdateMeInput,
} from '@vaya/validation';
import { setAccessToken, clearAuth } from './authSlice';
import { clearTokens } from '../services/auth/tokenStorage';

function getBaseUrl(): string {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra;
  return extra?.apiBaseUrl ?? 'http://localhost:3000/api/v1';
}

// Narrow slice of RootState — avoids a circular import with store.ts, which
// needs `api` (this module's default export) to build RootState itself.
interface AuthPartialState {
  auth: { accessToken: string | null; refreshToken: string | null };
}

export interface GeocodeResult {
  label: string;
  lat: number;
  lng: number;
}

export type LocationType =
  | 'country'
  | 'governorate'
  | 'city'
  | 'neighborhood'
  | 'poi'
  | 'address'
  | 'unknown';

/** A predicted result from the autocomplete session — no coordinates yet
 *  (Places API (New) never returns them from Autocomplete itself; only a
 *  Place Details call does — see geocodePlaceDetails below). Mirrors
 *  packages/validation/src/geocoding.ts's locationPredictionSchema. */
export interface LocationPrediction {
  placeId: string;
  primaryText: string;
  secondaryText: string | null;
  type: LocationType;
}

/** The Vaya-owned normalized location shape every provider (Google or the
 *  Nominatim fallback) resolves into — mirrors
 *  packages/validation/src/geocoding.ts's locationPointSchema. Raw
 *  Google/Nominatim response shapes never reach this file or any screen. */
export interface LocationPoint {
  placeId: string | null;
  label: string;
  primaryText: string;
  secondaryText: string | null;
  latitude: number;
  longitude: number;
  type: LocationType;
  formattedAddress: string | null;
  city: string | null;
  governorate: string | null;
  countryCode: string | null;
  source: 'google' | 'nominatim' | 'device' | 'manual';
}

export interface RankedStop {
  stopId: string;
  label: string;
  lat: number;
  lng: number;
  walkMinutes: number;
}

export interface MatchCandidate {
  rideId: string;
  driverUserId: string;
  driverFullName: string | null;
  ratingAvg: number;
  tripCount: number;
  departureAt: string;
  seatsAvailable: number;
  contributionPerSeat: number;
  pickupWalkMinutes: number;
  routeOverlapPercent: number;
  score: number;
  reasons: string[];
  clusterLabel: string;
  originLat: number;
  originLng: number;
  destinationLat: number;
  destinationLng: number;
  routePolyline: string | null;
  /** This ride's driver-selected route_stops, ranked by walk-distance from
   *  the passenger's requested origin, closest first. Empty for a legacy
   *  ride with zero route_stops (free-form pickup flow still applies). */
  rankedStops: RankedStop[];
  /** Dropoff-side mirror of `rankedStops` (Phase 13, docs/roadmap/
   *  phase-13-search-engine.md) — ranked by walk-distance from the
   *  passenger's requested destination. Empty means "drop off at the
   *  ride's own destination", the behavior every ride had before this
   *  field existed. */
  rankedDropoffStops: RankedStop[];
  /** False only when this ride has route_stops but none are within a
   *  walkable radius for this passenger — a legitimate "doesn't reach you
   *  conveniently" result. Always true for legacy (stop-less) rides. */
  pickupViable: boolean;
  /** Dropoff-side mirror of `pickupViable`. */
  dropoffViable: boolean;
  /** 'route_passthrough' when this ride was found because its route runs
   *  through the rider's corridor (the driver's own origin/destination are
   *  elsewhere), not because its own endpoints matched. 'detour' (Google/
   *  PostGIS location spec §7): a real routing-engine-calculated detour
   *  match — always pickupViable/dropoffViable: false, since no real
   *  driver-approved stop backs it yet (see `detour`'s own doc comment). */
  matchType: 'endpoint' | 'route_passthrough' | 'detour';
  /** Populated only for matchType: 'detour' — the real calculated cost of
   *  inserting this rider into the driver's route. Never a display-only
   *  estimate: every number here came from an actual routing-engine call. */
  detour: {
    extraDurationSeconds: number;
    extraDistanceMeters: number;
    detourRatio: number;
    pickupEtaSeconds: number;
    dropoffEtaSeconds: number;
  } | null;
}

/** Phase 13 (docs/roadmap/phase-13-search-engine.md): one search response
 *  now carries which tier of the server-side cascade produced it plus a
 *  ready-to-render French explanation — replaces the old two-endpoint
 *  (matching/search + matching/corridor-fallback) client-orchestrated pair
 *  the pre-Phase-13 UI used to build its own "why these results" banner
 *  copy from a local time-diff heuristic. */
export interface SearchResult {
  tier: 'exact' | 'wide_corridor' | 'route_passthrough' | 'detour_match' | 'closest_departure' | 'none';
  candidates: MatchCandidate[];
  message: string | null;
}

export interface PublicProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  driver: {
    bio: string | null;
    languages: string[] | null;
    ratingAvg: number;
    tripCount: number;
    punctualityScore: number;
    reliabilityScore: number;
    vehicle: {
      make: string;
      model: string;
      color: string;
      photoUrl: string | null;
      plateNumber: string;
    } | null;
  } | null;
}

export interface Me {
  id: string;
  phone: string | null;
  email: string | null;
  authProvider: 'phone' | 'google';
  fullName: string;
  avatarUrl: string | null;
  locale: 'fr' | 'ar' | 'en';
  createdAt: string;
  updatedAt: string;
}

export interface Vehicle {
  id: string;
  driverProfileId: string;
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  seatCount: number;
  photoUrl: string | null;
}

export interface VerificationDocument {
  id: string;
  driverProfileId: string;
  type: 'license' | 'registration';
  fileUrl: string;
  status: 'pending' | 'approved' | 'rejected';
}

export interface DriverProfile {
  id: string;
  userId: string;
  verificationStatus: 'pending' | 'approved' | 'rejected';
  bio: string | null;
  ratingAvg: number;
  tripCount: number;
  punctualityScore: number;
  reliabilityScore: number;
  approvedAt: string | null;
  vehicles: Vehicle[];
  documents: VerificationDocument[];
}

export interface Ride {
  id: string;
  driverProfileId: string;
  vehicleId: string;
  routeId: string | null;
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  departureAt: string;
  seatsTotal: number;
  seatsAvailable: number;
  contributionPerSeat: number;
  status: 'draft' | 'published' | 'full' | 'in_progress' | 'completed' | 'cancelled';
  routePolyline: string | null;
  estimatedDurationSec: number | null;
}

/** Phase 6 (docs/domain/pricing.md): the server-computed bounded price
 *  suggestion, returned alongside the ride by createRide/updateRide so the
 *  client never needs a second round-trip to render the price step. */
export interface SuggestedPrice {
  min: number;
  recommended: number;
  max: number;
}

export type RideWithPricing = Ride & { pricing: SuggestedPrice; routeIsEstimate: boolean };

export interface RouteStop {
  id: string;
  rideId: string;
  sequence: number;
  label: string;
  lat: number;
  lng: number;
  roadSnapped: boolean;
  deviationMeters: number;
  deviationSeconds: number;
  suitabilityScore: number;
  roadClass: string | null;
  isDriverSelected: boolean;
}

export interface GenerateStopsResult {
  stops: RouteStop[];
  /** True when OSRM was unreachable for this attempt — show an honest
   *  "unavailable right now" message, never fabricated candidates. */
  osrmUnavailable: boolean;
  regenerated: boolean;
}

export interface DeviceTokenRegistration {
  id: string;
  userId: string;
  token: string;
  platform: 'ios' | 'android';
  createdAt: string;
  updatedAt: string;
}

/** Mirrors the server's notification_event_type enum
 *  (apps/api/src/db/schema/notifications.schema.ts) — only the first 3
 *  ever get dispatched a push by this phase; the rest are scaffolding for
 *  future phases (Recurring Rides, demand signals) that already populate
 *  the same table shape. */
export type NotificationEventType =
  | 'booking_requested'
  | 'booking_accepted'
  | 'booking_declined'
  | 'trip_driver_approaching'
  | 'trip_completed'
  | 'recurring_pattern_detected'
  | 'recurring_proactive_match'
  | 'demand_signal_matched'
  | 'message_received'
  | 'booking_cancelled'
  | 'booking_no_show_reported';

export interface AppNotification {
  id: string;
  userId: string;
  type: NotificationEventType;
  payload: Record<string, unknown>;
  readAt: string | null;
  createdAt: string;
  updatedAt: string;
}

// Phase 8 (docs/roadmap/phase-08-messaging.md). `status` mirrors
// packages/domain's ConversationStatus ('open' | 'closed') — closed once
// the trip reaches a terminal state, permanently (never reopened).
export interface Conversation {
  id: string;
  bookingId: string;
  status: 'open' | 'closed';
  createdAt: string;
  updatedAt: string;
  /** Which side of the booking the requester is on — everything role-
   *  specific (labels, verification badge) is derived from this, server-
   *  side, so no client-side party guessing. */
  viewerRole: 'driver' | 'rider';
  otherParty: { id: string; fullName: string; avatarUrl: string | null };
  otherPartyRole: 'driver' | 'rider';
  /** Server-derived: true only when the other party is a driver with an
   *  approved verification — never guessed from anything else. */
  isOtherPartyVerified: boolean;
  originLabel: string;
  destinationLabel: string;
  departureAt: string;
  rideStatus: string;
  tripStatus: string | null;
  lastMessage: {
    body: string;
    createdAt: string;
    senderUserId: string;
  } | null;
}

export interface ConversationMessage {
  id: string;
  conversationId: string;
  senderUserId: string;
  body: string;
  createdAt: string;
}

/** Mirrors packages/domain's TripStatus. */
export type TripStatus =
  | 'scheduled'
  | 'driver_approaching'
  | 'pickup'
  | 'active'
  | 'arriving'
  | 'completed'
  | 'no_show'
  | 'cancelled';

export interface Trip {
  id: string;
  bookingId: string;
  rideId: string;
  status: TripStatus;
  simulationStartedAt: string | null;
  pickupConfirmedAt: string | null;
  dropoffAt: string | null;
  completedAt: string | null;
  riderSettlementConfirmedAt: string | null;
  driverSettlementConfirmedAt: string | null;
}

// Phase 9 (docs/roadmap/phase-09-ratings-trust.md). Mirrors
// packages/domain's RatingRole/TrustTier.
export type RatingRole = 'rider_rates_driver' | 'driver_rates_rider';
export type TrustTier = 'new' | 'trusted' | 'top_rated';

export interface CreateRatingBody {
  role: RatingRole;
  stars: number;
  punctualityFlag?: boolean;
  comment?: string;
}

export interface TierAggregate {
  tier: TrustTier;
  ratingAvg: number;
  tripCount: number;
  punctualityScore: number;
}

export interface TrustSummary {
  userId: string;
  driver: TierAggregate | null;
  rider: TierAggregate | null;
}

// Phase 11 (docs/roadmap/phase-11-recurring-rides.md). Mirrors
// packages/domain's RecurringPatternRole/RecurringPatternStatus.
export type RecurringPatternRole = 'rider' | 'driver';
export type RecurringPatternStatus = 'detected' | 'suggested' | 'enabled' | 'dismissed';

export interface RecurringPattern {
  id: string;
  userId: string;
  role: RecurringPatternRole;
  routeId: string | null;
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  /** Bitmask, Monday = bit 0 ... Sunday = bit 6. */
  daysOfWeekMask: number;
  timeWindowStart: string;
  timeWindowEnd: string;
  confidenceScore: number;
  status: RecurringPatternStatus;
  lastMatchedAt: string | null;
  createdAt: string;
  updatedAt: string;
  /** Only meaningful for an `enabled` driver pattern — see
   *  recurring.service.ts's listMyRecurringPatterns doc comment. */
  matchesToday: boolean;
  todayRideId: string | null;
}

export interface PendingRating {
  tripId: string;
  role: RatingRole;
  counterpartName: string | null;
  completedAt: string;
}

// Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md). Mirrors
// packages/domain's CancellationTier/CancellationPolicyResult.
export type CancellationTier = 'free' | 'moderate' | 'severe';

export interface CancellationPolicy {
  tier: CancellationTier;
  /** Negative once departure has already passed. */
  minutesBeforeDeparture: number;
  penaltyPoints: number;
  /** Server-authored, ready-to-display French copy — never re-derived client-side. */
  consequence: string;
}

export interface Booking {
  id: string;
  rideId: string;
  riderId: string;
  seatsRequested: number;
  contributionTotal: number;
  status:
    | 'pending'
    | 'accepted'
    | 'declined'
    | 'cancelled_by_rider'
    | 'cancelled_by_driver'
    | 'expired'
    | 'completed'
    | 'no_show';
  pickupStopId: string | null;
  pickupLabel: string;
  pickupLat: number;
  pickupLng: number;
  /** Phase 13 (docs/roadmap/phase-13-search-engine.md): null on almost every
   *  booking — the rider rides to the ride's own destination unchanged. Set
   *  only when the rider chose a mid-route dropoff stop on a
   *  route-passthrough match. */
  dropoffStopId: string | null;
  dropoffLabel: string | null;
  dropoffLat: number | null;
  dropoffLng: number | null;
  requestedAt: string;
  respondedAt: string | null;
  /** Only present on results from listMyBookings. */
  ride?: {
    originLabel: string;
    destinationLabel: string;
    departureAt: string;
    contributionPerSeat: number;
    driverFullName: string | null;
    driverUserId: string;
  };
  /** Only present on driver-facing results from listRequestsForRide —
   *  who is asking, so a request sheet isn't a list of opaque UUIDs. */
  rider?: {
    id: string;
    fullName: string;
    avatarUrl: string | null;
  };
}

/** Public, first-name-only — a ride's already-*accepted* fellow passengers.
 *  Never a pending/declined request, never a full identity. */
export interface FellowPassenger {
  userId: string;
  firstName: string;
  avatarUrl: string | null;
  ratingAvg: number;
}

const rawBaseQuery = fetchBaseQuery({
  baseUrl: getBaseUrl(),
  prepareHeaders: (headers, { getState }) => {
    const token = (getState() as AuthPartialState).auth.accessToken;
    if (token) headers.set('Authorization', `Bearer ${token}`);
    return headers;
  },
});

const baseQueryWithReauth: BaseQueryFn<string | FetchArgs, unknown, FetchBaseQueryError> = async (
  args,
  queryApi,
  extraOptions,
) => {
  let result = await rawBaseQuery(args, queryApi, extraOptions);

  if (result.error?.status === 401) {
    const refreshToken = (queryApi.getState() as AuthPartialState).auth.refreshToken;
    if (refreshToken) {
      const refreshResult = await rawBaseQuery(
        { url: '/auth/refresh', method: 'POST', body: { refreshToken } },
        queryApi,
        extraOptions,
      );
      if (refreshResult.data) {
        const { accessToken } = refreshResult.data as { accessToken: string; expiresIn: number };
        queryApi.dispatch(setAccessToken(accessToken));
        result = await rawBaseQuery(args, queryApi, extraOptions);
      } else {
        queryApi.dispatch(clearAuth());
        await clearTokens();
      }
    } else {
      queryApi.dispatch(clearAuth());
    }
  }

  return result;
};

export const api = createApi({
  reducerPath: 'api',
  baseQuery: baseQueryWithReauth,
  // Without these, a query only ever refetches when its own tag is
  // invalidated by a mutation *in this same app instance* — it never
  // reflects something that happened on someone else's device (a driver
  // accepting a request, a passenger's new booking). Real-world effect
  // this was causing: a driver taps a "new request" push notification,
  // lands on the request sheet, and sees whatever was cached from before —
  // not the new request — until they happen to background/foreground the
  // app or wait out keepUnusedDataFor. refetchOnFocus (wired to RN's
  // AppState below, since RTK Query's default only listens for the web
  // visibilitychange event) and refetchOnMountOrArgChange close that gap
  // for every screen, not just notification-triggered navigation.
  refetchOnFocus: true,
  refetchOnReconnect: true,
  refetchOnMountOrArgChange: 30,
  tagTypes: [
    'Me',
    'DriverProfile',
    'MyRides',
    'RideStops',
    'MyBookings',
    'RideRequests',
    'Notifications',
    'Conversations',
    'ConversationMessages',
    'Trip',
    'TrustSummary',
    'PendingRating',
    'RecurringPatterns',
  ],
  endpoints: (builder) => ({
    healthCheck: builder.query<{ status: string }, void>({
      query: () => '/health',
    }),

    requestOtp: builder.mutation<{ sent: boolean; devCode?: string }, RequestOtpInput>({
      query: (body) => ({ url: '/auth/otp/request', method: 'POST', body }),
    }),
    verifyOtp: builder.mutation<AuthTokens, VerifyOtpInput>({
      query: (body) => ({ url: '/auth/otp/verify', method: 'POST', body }),
    }),
    googleExchange: builder.mutation<AuthTokens, { ticket: string }>({
      query: (body) => ({ url: '/auth/google/exchange', method: 'POST', body }),
    }),
    logout: builder.mutation<{ success: boolean }, { refreshToken: string }>({
      query: (body) => ({ url: '/auth/logout', method: 'POST', body }),
    }),

    // Places API (New) session-token flow (docs/domain/location-
    // architecture-spec-2026-08-23.md): predictions only, no coordinates —
    // geocodePlaceDetails resolves the one the user actually picks.
    geocodeAutocomplete: builder.query<
      LocationPrediction[],
      { input: string; sessionToken: string }
    >({
      query: (params) => ({ url: '/geocoding/autocomplete', params }),
    }),
    geocodePlaceDetails: builder.query<
      LocationPoint | null,
      { placeId: string; sessionToken: string }
    >({
      query: (params) => ({ url: '/geocoding/place-details', params }),
    }),
    geocodeReverse: builder.query<GeocodeResult, { lat: number; lng: number }>({
      query: (params) => ({ url: '/geocoding/reverse', params }),
    }),

    matchingSearch: builder.query<
      SearchResult,
      {
        originLat: number;
        originLng: number;
        destinationLat: number;
        destinationLng: number;
        when: string;
      }
    >({
      query: (params) => ({ url: '/matching/search', params }),
    }),
    notifyMe: builder.mutation<{ id: string }, NotifyMeInput>({
      query: (body) => ({ url: '/matching/notify-me', method: 'POST', body }),
    }),

    getMe: builder.query<Me, void>({
      query: () => '/users/me',
      providesTags: ['Me'],
    }),
    // Profile hub: persists the rider-editable profile fields (avatar photo
    // URL from a completed /uploads call, chosen locale). Server-side shape
    // is updateMeSchema — fullName/locale/avatarFileUrl, all optional.
    updateMe: builder.mutation<Me, UpdateMeInput>({
      query: (body) => ({ url: '/users/me', method: 'PATCH', body }),
      invalidatesTags: ['Me'],
    }),
    // Attaching a phone to an already-authenticated (e.g. Google) account —
    // distinct from /auth/otp/*, which signs a session in/out. Same OTP
    // mechanics, but scoped to the current user and never creates a session.
    requestPhoneOtp: builder.mutation<{ sent: boolean; devCode?: string }, RequestOtpInput>({
      query: (body) => ({ url: '/users/me/phone/request-otp', method: 'POST', body }),
    }),
    verifyPhoneOtp: builder.mutation<Me, VerifyOtpInput>({
      query: (body) => ({ url: '/users/me/phone/verify', method: 'POST', body }),
      invalidatesTags: ['Me'],
    }),
    getUserPublicProfile: builder.query<PublicProfile, string>({
      query: (userId) => `/users/${userId}`,
    }),

    getMyDriverProfile: builder.query<DriverProfile, void>({
      query: () => '/drivers/me',
      providesTags: ['DriverProfile'],
    }),
    createDriverOnboarding: builder.mutation<DriverProfile, CreateDriverOnboardingInput>({
      query: (body) => ({ url: '/drivers/onboarding', method: 'POST', body }),
      invalidatesTags: ['DriverProfile'],
    }),
    updateVehicle: builder.mutation<Vehicle, UpdateVehicleInput>({
      query: (body) => ({ url: '/drivers/vehicle', method: 'PATCH', body }),
      invalidatesTags: ['DriverProfile'],
    }),

    uploadFile: builder.mutation<{ url: string }, FormData>({
      query: (formData) => ({ url: '/uploads', method: 'POST', body: formData }),
    }),

    createRide: builder.mutation<RideWithPricing, CreateRideInput>({
      query: (body) => ({ url: '/rides', method: 'POST', body }),
      invalidatesTags: ['MyRides'],
    }),
    // Phase 6: lets the driver adjust the price (or departure/seats) after
    // seeing the real computed bound createRide returned, before
    // publishing — see driver/publish.tsx's price step. Server re-validates
    // the bound independently (rides.service.ts's updateRide).
    updateRide: builder.mutation<RideWithPricing, { rideId: string; input: UpdateRideInput }>({
      query: ({ rideId, input }) => ({ url: `/rides/${rideId}`, method: 'PATCH', body: input }),
      invalidatesTags: (result, error, { rideId }) => ['MyRides', { type: 'MyRides', id: rideId }],
    }),
    listMyRides: builder.query<Ride[], void>({
      query: () => '/rides/mine',
      providesTags: ['MyRides'],
    }),
    // Was missing providesTags entirely, so publishRide/cancelRide/
    // updateRide's invalidatesTags never reached this query's own cache
    // entry — a driver publishing a ride and immediately reopening its
    // detail screen (or another screen that pre-warmed this same query)
    // could keep serving the pre-publish 'draft' row for up to the
    // 30s refetchOnMountOrArgChange window. Tagging it per-id closes that.
    getRide: builder.query<Ride, string>({
      query: (rideId) => `/rides/${rideId}`,
      providesTags: (result, error, rideId) => [{ type: 'MyRides', id: rideId }],
    }),
    cancelRide: builder.mutation<Ride, string>({
      query: (rideId) => ({ url: `/rides/${rideId}/cancel`, method: 'POST' }),
      invalidatesTags: (result, error, rideId) => ['MyRides', { type: 'MyRides', id: rideId }],
    }),
    publishRide: builder.mutation<Ride, string>({
      query: (rideId) => ({ url: `/rides/${rideId}/publish`, method: 'POST' }),
      invalidatesTags: (result, error, rideId) => ['MyRides', { type: 'MyRides', id: rideId }],
    }),
    generateCandidateStops: builder.mutation<GenerateStopsResult, string>({
      query: (rideId) => ({ url: `/rides/${rideId}/candidate-stops`, method: 'POST' }),
    }),
    updateRideStops: builder.mutation<
      RouteStop[],
      { rideId: string; selections: { stopId: string; isDriverSelected: boolean }[] }
    >({
      query: ({ rideId, selections }) => ({
        url: `/rides/${rideId}/stops`,
        method: 'PATCH',
        body: selections,
      }),
      invalidatesTags: (result, error, { rideId }) => [{ type: 'RideStops', id: rideId }],
    }),
    // A freehand pickup/dropoff pin that didn't match any generated
    // candidate (publish.tsx's map-selection flow) — persists it as a
    // real, immediately-selected route_stop instead of leaving it as
    // display-only screen state that vanishes on navigation. See
    // rides.service.ts's addCustomStop doc comment for the full reasoning.
    addCustomStop: builder.mutation<
      RouteStop,
      { rideId: string; label: string; lat: number; lng: number; role: 'pickup' | 'dropoff' }
    >({
      query: ({ rideId, ...body }) => ({
        url: `/rides/${rideId}/stops/custom`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (result, error, { rideId }) => [{ type: 'RideStops', id: rideId }],
    }),
    // Public, passenger-facing: only the driver-selected stops (no `?all=true`),
    // for the ride-details.tsx stop timeline — the same list a passenger's
    // pickup selection is drawn from, just for a single already-chosen ride.
    getRideStops: builder.query<RouteStop[], string>({
      query: (rideId) => `/rides/${rideId}/stops`,
      providesTags: (result, error, rideId) => [{ type: 'RideStops', id: rideId }],
    }),

    createBooking: builder.mutation<Booking, { rideId: string; input: CreateBookingInput }>({
      query: ({ rideId, input }) => ({
        url: `/rides/${rideId}/requests`,
        method: 'POST',
        body: input,
      }),
      invalidatesTags: ['MyBookings'],
    }),
    listFellowPassengers: builder.query<FellowPassenger[], string>({
      query: (rideId) => `/rides/${rideId}/fellow-passengers`,
    }),
    listMyBookings: builder.query<Booking[], void>({
      query: () => '/bookings/mine',
      providesTags: ['MyBookings'],
    }),
    listRequestsForRide: builder.query<Booking[], string>({
      query: (rideId) => `/rides/${rideId}/requests`,
      providesTags: ['RideRequests'],
    }),
    acceptBooking: builder.mutation<Booking, string>({
      query: (bookingId) => ({ url: `/bookings/${bookingId}/accept`, method: 'POST' }),
      invalidatesTags: ['RideRequests', 'MyRides'],
    }),
    declineBooking: builder.mutation<Booking, string>({
      query: (bookingId) => ({ url: `/bookings/${bookingId}/decline`, method: 'POST' }),
      invalidatesTags: ['RideRequests'],
    }),
    // Phase 10 (docs/roadmap/phase-10-cancellation-no-show.md). Read-only —
    // the cancellation sheet calls this to show the policy consequence
    // *before* the destructive cancelBooking mutation below is ever fired.
    getCancellationPreview: builder.query<CancellationPolicy, string>({
      query: (bookingId) => `/bookings/${bookingId}/cancellation-preview`,
    }),
    cancelBooking: builder.mutation<Booking & { cancellationPolicy: CancellationPolicy }, string>({
      query: (bookingId) => ({ url: `/bookings/${bookingId}/cancel`, method: 'POST' }),
      invalidatesTags: ['MyBookings', 'RideRequests', 'MyRides'],
    }),
    reportNoShow: builder.mutation<Booking, string>({
      query: (bookingId) => ({ url: `/bookings/${bookingId}/report-no-show`, method: 'POST' }),
      invalidatesTags: ['MyBookings', 'RideRequests', 'MyRides', 'Trip'],
    }),

    // Phase 7 (docs/roadmap/phase-07-notifications.md).
    registerPushToken: builder.mutation<
      DeviceTokenRegistration,
      { token: string; platform: 'ios' | 'android' }
    >({
      query: (body) => ({ url: '/users/me/push-token', method: 'POST', body }),
    }),
    listNotifications: builder.query<AppNotification[], void>({
      query: () => '/notifications',
      providesTags: ['Notifications'],
    }),
    markNotificationRead: builder.mutation<AppNotification, string>({
      query: (notificationId) => ({ url: `/notifications/${notificationId}/read`, method: 'PATCH' }),
      invalidatesTags: ['Notifications'],
    }),

    // Phase 8 (docs/roadmap/phase-08-messaging.md). Delivery is
    // polling-based: the conversation screen calls listConversationMessages
    // on an interval (RTK Query's `pollingInterval`), never a socket.
    listConversations: builder.query<Conversation[], void>({
      query: () => '/conversations',
      providesTags: ['Conversations'],
    }),
    getConversationByBooking: builder.query<Conversation, string>({
      query: (bookingId) => `/conversations/${bookingId}`,
    }),
    listConversationMessages: builder.query<
      ConversationMessage[],
      { conversationId: string; since?: string }
    >({
      query: ({ conversationId, since }) => ({
        url: `/conversations/${conversationId}/messages`,
        params: since ? { since } : undefined,
      }),
      providesTags: (_result, _error, { conversationId }) => [
        { type: 'ConversationMessages', id: conversationId },
      ],
    }),
    sendConversationMessage: builder.mutation<
      ConversationMessage,
      { conversationId: string; body: string }
    >({
      query: ({ conversationId, body }) => ({
        url: `/conversations/${conversationId}/messages`,
        method: 'POST',
        body: { body },
      }),
      invalidatesTags: (_result, _error, { conversationId }) => [
        { type: 'ConversationMessages', id: conversationId },
        'Conversations',
      ],
    }),

    // Phase 9 (docs/roadmap/phase-09-ratings-trust.md).
    getTripByBooking: builder.query<Trip, string>({
      query: (bookingId) => `/bookings/${bookingId}/trip`,
      providesTags: (_result, _error, bookingId) => [{ type: 'Trip', id: bookingId }],
    }),
    completeTrip: builder.mutation<Trip, string>({
      query: (tripId) => ({ url: `/trips/${tripId}/complete`, method: 'POST' }),
      invalidatesTags: ['Trip', 'PendingRating', 'MyBookings'],
    }),
    createTripRating: builder.mutation<{ id: string }, { tripId: string; input: CreateRatingBody }>({
      query: ({ tripId, input }) => ({
        url: `/trips/${tripId}/ratings`,
        method: 'POST',
        body: input,
      }),
      invalidatesTags: ['PendingRating', 'TrustSummary'],
    }),
    getUserTrustSummary: builder.query<TrustSummary, string>({
      query: (userId) => `/users/${userId}/trust-summary`,
      providesTags: (_result, _error, userId) => [{ type: 'TrustSummary', id: userId }],
    }),
    getPendingRating: builder.query<PendingRating | null, void>({
      query: () => '/trips/pending-rating',
      providesTags: ['PendingRating'],
    }),

    // Phase 11 (docs/roadmap/phase-11-recurring-rides.md).
    listMyRecurringPatterns: builder.query<RecurringPattern[], void>({
      query: () => '/recurring-patterns',
      providesTags: ['RecurringPatterns'],
    }),
    updateRecurringPattern: builder.mutation<
      RecurringPattern,
      { patternId: string; input: UpdateRecurringPatternInput }
    >({
      query: ({ patternId, input }) => ({
        url: `/recurring-patterns/${patternId}`,
        method: 'PATCH',
        body: input,
      }),
      invalidatesTags: ['RecurringPatterns'],
    }),
  }),
});

export const {
  useHealthCheckQuery,
  useRequestOtpMutation,
  useGoogleExchangeMutation,
  useRequestPhoneOtpMutation,
  useVerifyPhoneOtpMutation,
  useVerifyOtpMutation,
  useLogoutMutation,
  useGeocodeAutocompleteQuery,
  useLazyGeocodeAutocompleteQuery,
  useGeocodePlaceDetailsQuery,
  useLazyGeocodePlaceDetailsQuery,
  useGeocodeReverseQuery,
  useLazyGeocodeReverseQuery,
  useMatchingSearchQuery,
  useLazyMatchingSearchQuery,
  useNotifyMeMutation,
  useGetMeQuery,
  useUpdateMeMutation,
  useGetUserPublicProfileQuery,
  useGetMyDriverProfileQuery,
  useCreateDriverOnboardingMutation,
  useUpdateVehicleMutation,
  useUploadFileMutation,
  useCreateRideMutation,
  useUpdateRideMutation,
  useListMyRidesQuery,
  useGetRideQuery,
  useCancelRideMutation,
  usePublishRideMutation,
  useGenerateCandidateStopsMutation,
  useUpdateRideStopsMutation,
  useAddCustomStopMutation,
  useGetRideStopsQuery,
  useCreateBookingMutation,
  useListFellowPassengersQuery,
  useListMyBookingsQuery,
  useListRequestsForRideQuery,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
  useGetCancellationPreviewQuery,
  useCancelBookingMutation,
  useReportNoShowMutation,
  useRegisterPushTokenMutation,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useGetConversationByBookingQuery,
  useListConversationsQuery,
  useListConversationMessagesQuery,
  useSendConversationMessageMutation,
  useGetTripByBookingQuery,
  useCompleteTripMutation,
  useCreateTripRatingMutation,
  useGetUserTrustSummaryQuery,
  useGetPendingRatingQuery,
  useListMyRecurringPatternsQuery,
  useUpdateRecurringPatternMutation,
} = api;
