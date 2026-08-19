import { configureStore } from '@reduxjs/toolkit';
import type { TypedUseSelectorHook } from 'react-redux';
import { useDispatch, useSelector } from 'react-redux';
import searchReducer from './searchSlice';
import authReducer from './authSlice';
import driverOnboardingReducer from './driverOnboardingSlice';
import { api } from './api';

export const store = configureStore({
  reducer: {
    search: searchReducer,
    auth: authReducer,
    driverOnboarding: driverOnboardingReducer,
    [api.reducerPath]: api.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }).concat(api.middleware),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
