import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SearchLocation {
  label: string;
  subLabel?: string;
  lat: number;
  lng: number;
  isCurrentPosition?: boolean;
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
  /** UI-only passenger count shown on the search composer — `matching.search`
   *  doesn't filter by seat count today, so this is never sent to the API.
   *  Kept here (rather than local component state) only so it survives
   *  navigating between explore.tsx and search/composer.tsx. */
  passengers: number;
}

const initialState: SearchState = {
  origin: null,
  destination: null,
  searchAt: null,
  desiredDepartureAt: null,
  selectedStop: null,
  selectedDropoffStop: null,
  passengers: 1,
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
    /** Clears both pickup and dropoff selection — used whenever a fresh
     *  ride is selected (useOpenDriver) so neither can leak from a
     *  previously-viewed ride into a different one's booking. */
    clearSelectedStops(state) {
      state.selectedStop = null;
      state.selectedDropoffStop = null;
    },
    setPassengers(state, action: PayloadAction<number>) {
      state.passengers = Math.min(8, Math.max(1, action.payload));
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
  clearSelectedStops,
  setPassengers,
  resetSearch,
} = searchSlice.actions;
export default searchSlice.reducer;
