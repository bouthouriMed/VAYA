import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SearchLocation {
  label: string;
  subLabel?: string;
  lat: number;
  lng: number;
  isCurrentPosition?: boolean;
  /** Set when this location was resolved through the Places/Nominatim
   *  provider abstraction (search/composer.tsx) — absent for "Ma position
   *  actuelle" and any location set outside that flow. Not required by any
   *  existing consumer; purely additive. */
  placeId?: string;
  type?: 'country' | 'governorate' | 'city' | 'neighborhood' | 'poi' | 'address' | 'unknown';
}

/** A passenger's chosen pickup point from a matched ride's ranked
 *  candidate stops (docs/domain/ride-engine.md) — set by
 *  search/pickup-point.tsx, consumed by search/trust.tsx's createBooking
 *  call. Never a free-form pin: `stopId` always traces back to a real
 *  `route_stops` row the driver selected. */
export interface SelectedPickupStop {
  stopId: string;
  label: string;
  lat: number;
  lng: number;
}

/** Dropoff-side mirror of `SelectedPickupStop` (Phase 13, docs/roadmap/
 *  phase-13-search-engine.md) — set by search/dropoff-point.tsx, only ever
 *  reachable for a matched ride with `rankedDropoffStops`. Staying null
 *  means "ride to the ride's own destination", the behavior every booking
 *  had before this existed. */
export interface SelectedDropoffStop {
  stopId: string;
  label: string;
  lat: number;
  lng: number;
}

/** M-040/EDGE-053 (docs/unified_driver_and_passenger_journey.md §14, edge
 *  53): a passenger-chosen point OVERRIDING away from the driver's
 *  recommended stops — set by search/pickup-point.tsx's "choose another
 *  point" long-press affordance, after a real
 *  GET /rides/:rideId/pickup-override-preview recalculation has been shown
 *  and the passenger confirms anyway. Distinct from `SelectedPickupStop`:
 *  no `stopId` traces back to a real `route_stops` row — this is the
 *  free-form `pickup` booking path, carrying its own real coordinates.
 *  Mutually exclusive with `selectedStop` (selecting one clears the
 *  other). */
export interface OverriddenPickupPoint {
  label: string;
  lat: number;
  lng: number;
}

interface SearchState {
  origin: SearchLocation | null;
  destination: SearchLocation | null;
  /** ISO timestamp captured once when "Rechercher" is pressed — reused as
   *  the `when` param by results.tsx, ride-details.tsx and pickup-point.tsx
   *  so their useMatchingSearchQuery calls share one RTK Query cache entry
   *  instead of each computing `new Date()` independently and missing the
   *  cache. */
  searchAt: string | null;
  /** The rider's chosen departure window, set on explore.tsx's "Quand ?"
   *  field — null means "now" (the long-standing default: search departs
   *  the instant "Rechercher" is pressed). Kept separate from `searchAt`
   *  (which is always a concrete instant, captured once search starts)
   *  since this can be a still-open-ended user choice right up until
   *  that moment. */
  desiredDepartureAt: string | null;
  /** The pickup stop chosen on search/pickup-point.tsx for whichever ride
   *  is currently being booked. Cleared whenever a new ride is selected
   *  (useOpenDriver) so a stale stop from a previous ride can never leak
   *  into a different ride's booking. */
  selectedStop: SelectedPickupStop | null;
  /** Dropoff-side mirror of `selectedStop`. Cleared alongside it whenever a
   *  new ride is selected. */
  selectedDropoffStop: SelectedDropoffStop | null;
  /** M-040/EDGE-053: a real override point, set instead of `selectedStop`
   *  (never alongside it). Cleared whenever a new ride is selected, same as
   *  `selectedStop`/`selectedDropoffStop`. */
  overriddenPickup: OverriddenPickupPoint | null;
  /** UI-only passenger count shown on the search composer — `matching.search`
   *  doesn't filter by seat count today, so this is never sent to the API.
   *  Kept here (rather than local component state) only so it survives
   *  navigating between explore.tsx and search/composer.tsx. */
  passengers: number;
  /** A client-generated correlation id for the search-funnel analytics
   *  events (docs/domain/admin-platform.md's `analytics_events.search_id`)
   *  — set once per search session (explore.tsx's `ensureSearchSession`,
   *  called the first time a rider opens either field with a clean slate),
   *  threaded through origin_selected/destination_selected/search_submitted/
   *  search_results_shown/etc. so the funnel can be joined server-side.
   *  Not a security-sensitive id — a Math.random()-based generator is fine,
   *  same reasoning as search/composer.tsx's own Places-API session token. */
  searchId: string | null;
}

function generateSearchId(): string {
  return `s_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

const initialState: SearchState = {
  origin: null,
  destination: null,
  searchAt: null,
  desiredDepartureAt: null,
  selectedStop: null,
  selectedDropoffStop: null,
  overriddenPickup: null,
  passengers: 1,
  searchId: null,
};

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setOrigin(state, action: PayloadAction<SearchLocation>) {
      state.origin = action.payload;
    },
    setDestination(state, action: PayloadAction<SearchLocation>) {
      state.destination = action.payload;
    },
    swapOriginDestination(state) {
      const { origin, destination } = state;
      state.origin = destination;
      state.destination = origin;
    },
    setDesiredDepartureAt(state, action: PayloadAction<string | null>) {
      state.desiredDepartureAt = action.payload;
    },
    startSearch(state) {
      state.searchAt = state.desiredDepartureAt ?? new Date().toISOString();
    },
    selectPickupStop(state, action: PayloadAction<SelectedPickupStop>) {
      state.selectedStop = action.payload;
      state.overriddenPickup = null;
    },
    clearPickupStop(state) {
      state.selectedStop = null;
    },
    selectDropoffStop(state, action: PayloadAction<SelectedDropoffStop>) {
      state.selectedDropoffStop = action.payload;
    },
    clearDropoffStop(state) {
      state.selectedDropoffStop = null;
    },
    /** M-040/EDGE-053: sets a real override point, mutually exclusive with
     *  `selectedStop` (a real, driver-recommended stop). */
    selectOverriddenPickup(state, action: PayloadAction<OverriddenPickupPoint>) {
      state.overriddenPickup = action.payload;
      state.selectedStop = null;
    },
    clearOverriddenPickup(state) {
      state.overriddenPickup = null;
    },
    /** Clears both pickup and dropoff selection — used whenever a fresh
     *  ride is selected (useOpenDriver) so neither can leak from a
     *  previously-viewed ride into a different one's booking. */
    clearSelectedStops(state) {
      state.selectedStop = null;
      state.selectedDropoffStop = null;
      state.overriddenPickup = null;
    },
    setPassengers(state, action: PayloadAction<number>) {
      state.passengers = Math.min(8, Math.max(1, action.payload));
    },
    /** Idempotent — a searchId already set (mid-session, still picking
     *  origin/destination) is never replaced, so origin_selected/
     *  destination_selected/search_submitted all share the same id. */
    ensureSearchSession(state) {
      if (!state.searchId) state.searchId = generateSearchId();
    },
    resetSearch() {
      return initialState;
    },
  },
});

export const {
  setOrigin,
  setDestination,
  swapOriginDestination,
  setDesiredDepartureAt,
  startSearch,
  selectPickupStop,
  clearPickupStop,
  selectDropoffStop,
  clearDropoffStop,
  selectOverriddenPickup,
  clearOverriddenPickup,
  clearSelectedStops,
  setPassengers,
  ensureSearchSession,
  resetSearch,
} = searchSlice.actions;
export default searchSlice.reducer;
