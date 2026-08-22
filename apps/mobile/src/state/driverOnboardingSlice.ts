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

interface DriverOnboardingState {
  vehicle: VehicleDraft | null;
  licenseUri: string | null;
  insuranceUri: string | null;
  selfieUri: string | null;
  pendingRide: PendingRide | null;
}

const initialState: DriverOnboardingState = {
  vehicle: null,
  licenseUri: null,
  insuranceUri: null,
  selfieUri: null,
  pendingRide: null,
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
  resetDriverOnboarding,
} = driverOnboardingSlice.actions;
export default driverOnboardingSlice.reducer;
