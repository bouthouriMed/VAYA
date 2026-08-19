// Real react-native-maps is a native module — not resolvable in the vitest
// 'node' test environment. Opaque element-type strings, matching the
// pattern in __mocks__/react-native.ts and __mocks__/expo-vector-icons.ts
// (elements are never actually rendered here, only imported/instantiated
// for smoke tests).
const MapView = 'MapView';
export default MapView;

export const Marker = 'Marker';
export const Polyline = 'Polyline';
export const PROVIDER_DEFAULT = 'default';
export const PROVIDER_GOOGLE = 'google';
