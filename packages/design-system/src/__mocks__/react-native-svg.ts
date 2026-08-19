// Real react-native-svg is a native module — not resolvable in the vitest
// 'node' test environment. Opaque element-type strings, matching the
// pattern in __mocks__/react-native.ts and __mocks__/react-native-maps.ts
// (elements are never actually rendered here, only imported/instantiated
// for smoke tests).
const Svg = 'Svg';
export default Svg;

export const Circle = 'Circle';
