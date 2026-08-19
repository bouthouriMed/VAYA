import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

interface AuthState {
  accessToken: string | null;
  refreshToken: string | null;
  /** False until SecureStore has been read once at app boot — used to avoid
   *  flashing the landing screen before we know whether a session exists. */
  hydrated: boolean;
}

const initialState: AuthState = {
  accessToken: null,
  refreshToken: null,
  hydrated: false,
};

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    setTokens(state, action: PayloadAction<{ accessToken: string; refreshToken: string }>) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
    },
    setAccessToken(state, action: PayloadAction<string>) {
      state.accessToken = action.payload;
    },
    clearAuth(state) {
      state.accessToken = null;
      state.refreshToken = null;
    },
    hydrateAuth(
      state,
      action: PayloadAction<{ accessToken: string | null; refreshToken: string | null }>,
    ) {
      state.accessToken = action.payload.accessToken;
      state.refreshToken = action.payload.refreshToken;
      state.hydrated = true;
    },
  },
});

export const { setTokens, setAccessToken, clearAuth, hydrateAuth } = authSlice.actions;
export default authSlice.reducer;
