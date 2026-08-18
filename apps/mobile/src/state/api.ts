import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';
import Constants from 'expo-constants';

function getBaseUrl(): string {
  const extra = Constants.expoConfig?.extra ?? Constants.manifest?.extra;
  const baseUrl = extra?.apiBaseUrl ?? 'http://localhost:3000/api/v1';
  return baseUrl;
}

export const api = createApi({
  reducerPath: 'api',
  baseQuery: fetchBaseQuery({ baseUrl: getBaseUrl() }),
  endpoints: (_builder) => ({
    healthCheck: _builder.query<{ status: string }, void>({
      query: () => '/health',
    }),
  }),
});

export const { useHealthCheckQuery } = api;
