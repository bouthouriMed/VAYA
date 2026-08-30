// Hand-mirrored from apps/api's Drizzle schema + admin service return
// shapes (there is no generated/shared client this app can import — see
// apps/api/src/modules/admin/*.service.ts for the source of truth). Kept
// intentionally loose (optional/unknown-ish fields) rather than a strict
// 1:1 schema mirror, since these responses are `z.any()` on the server
// (admin.routes.ts's own doc comment: internal-only, wide nested graphs,
// hand-enumerating would just duplicate the query shape).

export type VerificationStatus = 'pending' | 'under_review' | 'approved' | 'rejected' | 'resubmission_required';
export type VerificationDeclineReason =
  | 'document_unclear'
  | 'expired'
  | 'information_mismatch'
  | 'missing_document'
  | 'invalid_document'
  | 'additional_info_required'
  | 'other';
export type RideStatus = 'draft' | 'published' | 'full' | 'in_progress' | 'completed' | 'cancelled';
export type BookingStatus =
  | 'pending'
  | 'accepted'
  | 'declined'
  | 'cancelled_by_rider'
  | 'cancelled_by_driver'
  | 'expired'
  | 'completed'
  | 'no_show';
export type TripStatus =
  | 'scheduled'
  | 'driver_approaching'
  | 'pickup'
  | 'active'
  | 'arriving'
  | 'completed'
  | 'no_show'
  | 'cancelled';
export type ReportStatus = 'open' | 'investigating' | 'resolved' | 'dismissed';
export type ReportCategory =
  | 'unsafe_driving'
  | 'harassment'
  | 'no_show'
  | 'payment_dispute'
  | 'vehicle_condition'
  | 'other';

export interface AdminSession {
  id: string;
  email: string;
  fullName: string;
  role: 'admin' | 'superadmin';
}

export interface Paginated<T> {
  items: T[];
  total: number;
  page: number;
  limit: number;
}

export interface UserRow {
  id: string;
  phone: string | null;
  email: string | null;
  fullName: string;
  avatarUrl: string | null;
  authProvider: 'phone' | 'google';
  locale: 'fr' | 'ar' | 'en';
  suspendedAt: string | null;
  suspendedReason: string | null;
  createdAt: string;
  updatedAt: string;
  driverProfile: DriverProfileRow | null;
  riderProfile: { id: string; tripCount: number; reliabilityPenaltyPoints?: number } | null;
}

export interface VehicleRow {
  id: string;
  driverProfileId: string;
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  seatCount: number;
  photoUrl: string | null;
}

export interface VerificationDocumentRow {
  id: string;
  driverProfileId: string;
  type: 'license' | 'registration' | 'insurance' | 'selfie';
  fileUrl: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: string;
}

export interface DriverProfileRow {
  id: string;
  userId: string;
  verificationStatus: VerificationStatus;
  bio: string | null;
  ratingAvg: number;
  tripCount: number;
  punctualityScore: number;
  reliabilityScore: number;
  reliabilityPenaltyPoints: number;
  approvedAt: string | null;
  verificationSubmittedAt: string | null;
  verificationReviewedAt: string | null;
  verificationDeclineReason: VerificationDeclineReason | null;
  verificationDeclineMessage: string | null;
  verificationAttempt: number;
  suspendedAt: string | null;
  suspendedReason: string | null;
  vehicles: VehicleRow[];
  documents: VerificationDocumentRow[];
  user?: UserRow;
}

export interface RideRow {
  id: string;
  driverProfileId: string;
  vehicleId: string;
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
  status: RideStatus;
  routePolyline: string | null;
  createdAt: string;
  driverProfile?: DriverProfileRow & { user: UserRow };
  vehicle?: VehicleRow;
  stops?: unknown[];
  bookings?: BookingRow[];
}

export interface BookingRow {
  id: string;
  rideId: string;
  riderId: string;
  seatsRequested: number;
  contributionTotal: number;
  status: BookingStatus;
  pickupLabel: string;
  dropoffLabel: string | null;
  requestedAt: string;
  respondedAt: string | null;
  rider?: UserRow;
  ride?: RideRow;
  trip?: { id: string; status: TripStatus } | null;
}

export interface ReportRow {
  id: string;
  reporterUserId: string;
  reportedUserId: string | null;
  bookingId: string | null;
  tripId: string | null;
  category: ReportCategory;
  description: string;
  status: ReportStatus;
  resolutionNotes: string | null;
  resolvedAt: string | null;
  createdAt: string;
  reporter?: UserRow;
  reportedUser?: UserRow | null;
}

export interface AuditLogRow {
  id: string;
  adminUserId: string;
  adminUser?: { id: string; fullName: string; email: string };
  action: string;
  targetType: string;
  targetId: string;
  reason: string | null;
  previousState: unknown;
  newState: unknown;
  createdAt: string;
}

export interface OverviewMetrics {
  windowDays: number;
  users: { total: number; new: number; active: number; passengers: number; drivers: number; verifiedDrivers: number };
  rides: {
    draft: number;
    published: number;
    full: number;
    inProgress: number;
    completed: number;
    cancelled: number;
    seatsOffered: number;
    seatsBooked: number;
    utilization: number | null;
  };
  marketplace: {
    searches: number;
    searchesWithMatches: number;
    zeroResultSearches: number;
    searchResultsShown: number;
    searchResultSelected: number;
    searchToResultConversion: number | null;
    resultToSelectionConversion: number | null;
    bookingSuccessRate: number | null;
    cancellationRate: number | null;
    completionRate: number | null;
  };
}

export interface CorridorDemandRow {
  corridorKey: string | null;
  originLabel: string | null;
  destinationLabel: string | null;
  demand: number;
  supply: number;
  matched: number;
  matchRate: number | null;
  unmetDemand: number;
}

export type SearchFunnelEventName =
  | 'search_started'
  | 'origin_selected'
  | 'destination_selected'
  | 'search_submitted'
  | 'search_results_shown'
  | 'search_result_selected'
  | 'search_no_results'
  | 'search_abandoned';

export interface SearchFunnelRow {
  eventName: SearchFunnelEventName;
  count: number;
}

export interface VerificationQueueResult extends Paginated<DriverProfileRow> {
  countsByStatus: Partial<Record<VerificationStatus, number>>;
}

export interface VerificationDetailResult {
  profile: DriverProfileRow;
  history: AuditLogRow[];
}

export interface UserDetailResult {
  user: UserRow;
  ridesAsDriver: RideRow[];
  bookingsAsRider: BookingRow[];
}

// VAYA Operational Policy Configuration
// (docs/unified_driver_and_passenger_journey.md §28) — every threshold
// always resolved (an admin override, or @vaya/domain's own pure default),
// never a bare null the UI would have to guess a fallback for.
export interface OperationalConfig {
  maxDetourRatio: number;
  existingPassengerMaxDelayRatio: number;
  existingPassengerMaxAbsoluteDelayMinutes: number;
  cancellationFreeWindowHours: number;
  cancellationModerateWindowMinutes: number;
  noShowMinMinutesAfterDeparture: number;
  noShowMaxReporterDistanceMeters: number;
  routeDeviationNoiseThresholdMeters: number;
  routeDeviationRealThresholdMeters: number;
  bookingResponseWindowMinutes: number;
  sameJourneyPickupRadiusMeters: number;
  sameJourneyDropoffRadiusMeters: number;
  sameJourneyTimeWindowMinutes: number;
  maxActiveRequestsPerJourney: number;
}
