// Real expo-constants reads native app config — not resolvable in the
// vitest 'node' test environment. Matches this __mocks__ folder's existing
// pattern (expo-haptics, expo-blur, ...): a minimal stand-in covering only
// what MapCanvas actually reads, defaulted to "not Expo Go" so tests exercise
// the same PROVIDER_GOOGLE path a real dev-client/production build takes.
export enum ExecutionEnvironment {
  Bare = 'bare',
  Standalone = 'standalone',
  StoreClient = 'storeClient',
}

const Constants = {
  executionEnvironment: ExecutionEnvironment.Bare,
  appOwnership: null as 'expo' | 'standalone' | 'guest' | null,
};

export default Constants;
