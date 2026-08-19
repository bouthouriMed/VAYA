// Real Ionicons is a React Native component backed by native font assets —
// not resolvable in the vitest 'node' environment. This stands in as an
// opaque element-type string, matching the pattern in
// __mocks__/react-native.ts (elements are never actually rendered here,
// only imported/instantiated for smoke tests).
export const Ionicons = 'Ionicons';
