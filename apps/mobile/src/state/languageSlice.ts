import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SupportedLocale } from '@vaya/config';

interface LanguageState {
  locale: SupportedLocale;
  /** Whether `locale` came from an explicit user choice (languageStorage.ts)
   *  vs. this session's device-locale guess (detectDeviceLocale). Lets
   *  future logic tell the two apart without re-reading storage — e.g. to
   *  never overwrite an explicit choice with a new device-locale guess. */
  isExplicit: boolean;
}

// The real startup locale (persisted choice or device-locale guess) is
// resolved synchronously before first render — see _layout.tsx's
// `initI18n(resolveStartupLocale())` — and passed in as this slice's
// initial state via `hydrateLanguage`'s dispatch on mount. 'en' here is only
// ever visible for the handful of milliseconds before that hydration lands.
const initialState: LanguageState = { locale: 'en', isExplicit: false };

const languageSlice = createSlice({
  name: 'language',
  initialState,
  reducers: {
    /** Startup hydration from SecureStore / device-locale detection. */
    hydrateLanguage(state, action: PayloadAction<{ locale: SupportedLocale; isExplicit: boolean }>) {
      state.locale = action.payload.locale;
      state.isExplicit = action.payload.isExplicit;
    },
    /** The user picked a language in profile.tsx — persistence, i18next's
     *  own changeLanguage(), and RTL direction are all the caller's job so
     *  failures can surface distinctly (this mirrors appearanceSlice's
     *  split between state and side effects). */
    setLanguage(state, action: PayloadAction<SupportedLocale>) {
      state.locale = action.payload;
      state.isExplicit = true;
    },
  },
});

export const { hydrateLanguage, setLanguage } = languageSlice.actions;
export default languageSlice.reducer;
