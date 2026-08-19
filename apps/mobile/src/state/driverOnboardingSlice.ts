import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

export interface VehicleDraft {
  make: string;
  model: string;
  color: string;
  plateNumber: string;
  seatCount: number;
}

interface DriverOnboardingState {
  vehicle: VehicleDraft | null;
  licenseUri: string | null;
  insuranceUri: string | null;
  selfieUri: string | null;
}

const initialState: DriverOnboardingState = {
  vehicle: null,
  licenseUri: null,
  insuranceUri: null,
  selfieUri: null,
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
  resetDriverOnboarding,
} = driverOnboardingSlice.actions;
export default driverOnboardingSlice.reducer;
