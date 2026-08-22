import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { AppearancePreference } from '../services/settings/appearanceStorage';

interface AppearanceState {
  preference: AppearancePreference;
}

const initialState: AppearanceState = { preference: 'system' };

const appearanceSlice = createSlice({
  name: 'appearance',
  initialState,
  reducers: {
    /** Startup hydration from SecureStore (see appearanceStorage.ts). */
    hydrateAppearance(state, action: PayloadAction<AppearancePreference>) {
      state.preference = action.payload;
    },
    /** The user picked a new value in profile.tsx — persistence itself is
     *  the caller's job so a storage failure can surface as a toast. */
    setAppearance(state, action: PayloadAction<AppearancePreference>) {
      state.preference = action.payload;
    },
  },
});

export const { hydrateAppearance, setAppearance } = appearanceSlice.actions;
export default appearanceSlice.reducer;
