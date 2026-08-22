// Real expo-blur is a native module (and ships un-transpiled JSX in its
// build output, which the vitest 'node' environment can't parse either way)
// — not resolvable in tests. Opaque element-type string, matching the
// pattern in __mocks__/react-native.ts and __mocks__/react-native-maps.ts
// (elements are never actually rendered here, only imported/instantiated
// for smoke tests).
export const BlurView = 'BlurView';
