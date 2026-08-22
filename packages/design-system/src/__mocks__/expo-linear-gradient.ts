// Real expo-linear-gradient is a native module — not resolvable in the
// vitest 'node' environment. Opaque element-type string, matching the
// pattern in __mocks__/react-native.ts and __mocks__/expo-blur.ts (elements
// are never actually rendered here, only imported/instantiated for smoke
// tests).
export const LinearGradient = 'LinearGradient';
