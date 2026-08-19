import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface SearchLocation {
  label: string;
  subLabel?: string;
  lat: number;
  lng: number;
  isCurrentPosition?: boolean;
}

interface SearchState {
  origin: SearchLocation | null;
  destination: SearchLocation | null;
  /** True once the rider has explicitly confirmed an exact pickup pin on the
   *  map (vs. just having a raw GPS/geocoded origin). */
  pickupConfirmed: boolean;
  /** ISO timestamp captured once when "Rechercher" is pressed — reused as
   *  the `when` param by both results.tsx and cluster.tsx so their
   *  useMatchingSearchQuery calls share one RTK Query cache entry instead
   *  of each computing `new Date()` independently and missing the cache. */
  searchAt: string | null;
}

const initialState: SearchState = {
  origin: null,
  destination: null,
  pickupConfirmed: false,
  searchAt: null,
};

const searchSlice = createSlice({
  name: 'search',
  initialState,
  reducers: {
    setOrigin(state, action: PayloadAction<SearchLocation>) {
      state.origin = action.payload;
      state.pickupConfirmed = false;
    },
    setDestination(state, action: PayloadAction<SearchLocation>) {
      state.destination = action.payload;
    },
    confirmPickupPoint(state, action: PayloadAction<SearchLocation>) {
      state.origin = action.payload;
      state.pickupConfirmed = true;
    },
    swapOriginDestination(state) {
      const { origin, destination } = state;
      state.origin = destination;
      state.destination = origin;
      state.pickupConfirmed = false;
    },
    startSearch(state) {
      state.searchAt = new Date().toISOString();
    },
    resetSearch() {
      return initialState;
    },
  },
});

export const {
  setOrigin,
  setDestination,
  confirmPickupPoint,
  swapOriginDestination,
  startSearch,
  resetSearch,
} = searchSlice.actions;
export default searchSlice.reducer;
