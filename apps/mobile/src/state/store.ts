import { configureStore } from '@reduxjs/toolkit';
import { setupListeners } from '@reduxjs/toolkit/query';
import type { TypedUseSelectorHook } from 'react-redux';
import { useDispatch, useSelector } from 'react-redux';
import { AppState, type AppStateStatus } from 'react-native';
import searchReducer from './searchSlice';
import authReducer from './authSlice';
import driverOnboardingReducer from './driverOnboardingSlice';
import appearanceReducer from './appearanceSlice';
import { api } from './api';

export const store = configureStore({
  reducer: {
    search: searchReducer,
    auth: authReducer,
    driverOnboarding: driverOnboardingReducer,
    appearance: appearanceReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(api.middleware),
});

// RTK Query's own setupListeners only wires the web `visibilitychange`/
// `online` events — meaningless in React Native. Without this, api.ts's
// refetchOnFocus/refetchOnReconnect do nothing: a driver backgrounding the
// app to check a push notification, then returning, would never see the
// data behind it refresh. AppState is the RN equivalent of tab focus.
setupListeners(store.dispatch, (dispatch, { onFocus, onFocusLost }) => {
  const subscription = AppState.addEventListener('change', (state: AppStateStatus) => {
    if (state === 'active') dispatch(onFocus());
    else dispatch(onFocusLost());
  });
  return () => subscription.remove();
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
