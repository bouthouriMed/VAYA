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
  tagTypes: ['Me', 'DriverProfile', 'MyRides', 'MyBookings', 'RideRequests'],
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

    createRide: builder.mutation<Ride, CreateRideInput>({
      query: (body) => ({ url: '/rides', method: 'POST', body }),
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
  useListMyRidesQuery,
  useGetRideQuery,
  useCancelRideMutation,
  useCreateBookingMutation,
  useListMyBookingsQuery,
  useListRequestsForRideQuery,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
  useCancelBookingMutation,
} = api;
