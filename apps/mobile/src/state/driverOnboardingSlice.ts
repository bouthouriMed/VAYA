import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface VehicleDraft {
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  seatCount: number;
}

/** Carried in from the publish flow's review screen (stitch/verification's
 *  publish-verification-requirement-prompt.html) when an unverified driver
 *  taps "Commencer la vérification" with a draft ride already saved — lets
 *  the onboarding wizard's last step auto-publish that ride once
 *  verification completes, instead of leaving it stranded as a draft. */
export interface PendingRide {
  rideId: string;
  originLabel: string;
  destinationLabel: string;
}

/** Same hand-off as `PendingRide`, but for a driver who had no vehicle at
 *  all yet when they hit "Publier ce trajet" (never onboarded — the publish
 *  tab now opens this wizard even then). No server-side ride exists to
 *  reference, so the raw ride draft travels through onboarding instead; the
 *  ride itself is created (and immediately published) once a real
 *  `vehicleId` exists, right after onboarding succeeds. */
export interface PendingRideDraft {
  originLabel: string;
  originLat: number;
  originLng: number;
  destinationLabel: string;
  destinationLat: number;
  destinationLng: number;
  /** ISO string — Redux state must stay serializable. */
  departureAt: string;
  seatsTotal: number;
}

interface DriverOnboardingState {
  vehicle: VehicleDraft | null;
  licenseUri: string | null;
  insuranceUri: string | null;
  selfieUri: string | null;
  pendingRide: PendingRide | null;
  pendingRideDraft: PendingRideDraft | null;
}

const initialState: DriverOnboardingState = {
  vehicle: null,
  licenseUri: null,
  insuranceUri: null,
  selfieUri: null,
  pendingRide: null,
  pendingRideDraft: null,
};

const driverOnboardingSlice = createSlice({
  name: 'driverOnboarding',
  initialState,
  reducers: {
    setVehicleDraft(state, action: PayloadAction<VehicleDraft>) {
      state.vehicle = action.payload;
    },
    setLicenseUri(state, action: PayloadAction<string>) {
      state.licenseUri = action.payload;
    },
    setInsuranceUri(state, action: PayloadAction<string>) {
      state.insuranceUri = action.payload;
    },
    setSelfieUri(state, action: PayloadAction<string>) {
      state.selfieUri = action.payload;
    },
    setPendingRide(state, action: PayloadAction<PendingRide>) {
      state.pendingRide = action.payload;
    },
    setPendingRideDraft(state, action: PayloadAction<PendingRideDraft>) {
      state.pendingRideDraft = action.payload;
    },
    resetDriverOnboarding() {
      return initialState;
    },
  },
});

export const {
  setVehicleDraft,
  setLicenseUri,
  setInsuranceUri,
  setSelfieUri,
  setPendingRide,
  setPendingRideDraft,
  resetDriverOnboarding,
} = driverOnboardingSlice.actions;
export default driverOnboardingSlice.reducer;
