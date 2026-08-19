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

interface SearchState {
  origin: SearchLocation | null;
  destination: SearchLocation | null;
  /** ISO timestamp captured once when "Rechercher" is pressed — reused as
   *  the `when` param by both results.tsx and cluster.tsx so their
   *  useMatchingSearchQuery calls share one RTK Query cache entry instead
   *  of each computing `new Date()` independently and missing the cache. */
  searchAt: string | null;
  /** The pickup stop chosen on search/pickup-point.tsx for whichever ride
   *  is currently being booked. Cleared whenever a new ride is selected
   *  (cluster.tsx) so a stale stop from a previous ride can never leak
   *  into a different ride's booking. */
  selectedStop: SelectedPickupStop | null;
}

const initialState: SearchState = {
  origin: null,
  destination: null,
  searchAt: null,
  selectedStop: null,
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
    startSearch(state) {
      state.searchAt = new Date().toISOString();
    },
    selectPickupStop(state, action: PayloadAction<SelectedPickupStop>) {
      state.selectedStop = action.payload;
    },
    clearPickupStop(state) {
      state.selectedStop = null;
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
  startSearch,
  selectPickupStop,
  clearPickupStop,
  resetSearch,
} = searchSlice.actions;
export default searchSlice.reducer;
