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
  /** False only when this ride has route_stops but none are within a
   *  walkable radius for this passenger — a legitimate "doesn't reach you
   *  conveniently" result. Always true for legacy (stop-less) rides. */
  pickupViable: boolean;
}

export interface CorridorFallbackResult {
  nearbyRides: MatchCandidate[];
  demandSignalCount: number;
}

export interface PublicProfile {
  id: string;
  fullName: string;
  avatarUrl: string | null;
  driver: {
    ratingAvg: number;
    tripCount: number;
    punctualityScore: number;
    reliabilityScore: number;
    vehicle: { make: string; model: string; color: string; photoUrl: string | null } | null;
  } | null;
}

export interface Me {
  id: string;
  phone: string;
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
  | 'message_received';

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

export interface PendingRating {
  tripId: string;
  role: RatingRole;
  counterpartName: string | null;
  completedAt: string;
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
  requestedAt: string;
  respondedAt: string | null;
  /** Only present on results from listMyBookings. */
  ride?: {
    originLabel: string;
    destinationLabel: string;
    departureAt: string;
    contributionPerSeat: number;
    driverFullName: string | null;
  };
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
  tagTypes: [
    'Me',
    'DriverProfile',
    'MyRides',
    'MyBookings',
    'RideRequests',
    'Notifications',
    'ConversationMessages',
    'Trip',
    'TrustSummary',
    'PendingRating',
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
    logout: builder.mutation<{ success: boolean }, { refreshToken: string }>({
      query: (body) => ({ url: '/auth/logout', method: 'POST', body }),
    }),

    geocodeSearch: builder.query<GeocodeResult[], string>({
      query: (q) => ({ url: '/geocoding/search', params: { q } }),
    }),
    geocodeReverse: builder.query<GeocodeResult, { lat: number; lng: number }>({
      query: (params) => ({ url: '/geocoding/reverse', params }),
    }),

    matchingSearch: builder.query<
      MatchCandidate[],
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
    corridorFallback: builder.query<
      CorridorFallbackResult,
      {
        originLat: number;
        originLng: number;
        destinationLat: number;
        destinationLng: number;
        when: string;
      }
    >({
      query: (params) => ({ url: '/matching/corridor-fallback', params }),
    }),
    notifyMe: builder.mutation<{ id: string }, NotifyMeInput>({
      query: (body) => ({ url: '/matching/notify-me', method: 'POST', body }),
    }),

    getMe: builder.query<Me, void>({
      query: () => '/users/me',
      providesTags: ['Me'],
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
      invalidatesTags: ['MyRides'],
    }),
    listMyRides: builder.query<Ride[], void>({
      query: () => '/rides/mine',
      providesTags: ['MyRides'],
    }),
    getRide: builder.query<Ride, string>({
      query: (rideId) => `/rides/${rideId}`,
    }),
    cancelRide: builder.mutation<Ride, string>({
      query: (rideId) => ({ url: `/rides/${rideId}/cancel`, method: 'POST' }),
      invalidatesTags: ['MyRides'],
    }),
    publishRide: builder.mutation<Ride, string>({
      query: (rideId) => ({ url: `/rides/${rideId}/publish`, method: 'POST' }),
      invalidatesTags: ['MyRides'],
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
    }),

    createBooking: builder.mutation<Booking, { rideId: string; input: CreateBookingInput }>({
      query: ({ rideId, input }) => ({
        url: `/rides/${rideId}/requests`,
        method: 'POST',
        body: input,
      }),
      invalidatesTags: ['MyBookings'],
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
    cancelBooking: builder.mutation<Booking, string>({
      query: (bookingId) => ({ url: `/bookings/${bookingId}/cancel`, method: 'POST' }),
      invalidatesTags: ['MyBookings', 'RideRequests', 'MyRides'],
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
  }),
});

export const {
  useHealthCheckQuery,
  useRequestOtpMutation,
  useVerifyOtpMutation,
  useLogoutMutation,
  useGeocodeSearchQuery,
  useLazyGeocodeSearchQuery,
  useGeocodeReverseQuery,
  useMatchingSearchQuery,
  useLazyMatchingSearchQuery,
  useCorridorFallbackQuery,
  useLazyCorridorFallbackQuery,
  useNotifyMeMutation,
  useGetMeQuery,
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
  useCreateBookingMutation,
  useListMyBookingsQuery,
  useListRequestsForRideQuery,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
  useCancelBookingMutation,
  useRegisterPushTokenMutation,
  useListNotificationsQuery,
  useMarkNotificationReadMutation,
  useGetConversationByBookingQuery,
  useListConversationMessagesQuery,
  useSendConversationMessageMutation,
  useGetTripByBookingQuery,
  useCompleteTripMutation,
  useCreateTripRatingMutation,
  useGetUserTrustSummaryQuery,
  useGetPendingRatingQuery,
} = api;
