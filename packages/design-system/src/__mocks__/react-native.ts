import React from 'react';

const Platform = {
  OS: 'web' as const,
  select: <T extends Record<string, unknown>>(obj: T): T[keyof T] | undefined => {
    return (obj.web as T[keyof T]) ?? (obj.default as T[keyof T]);
  },
};

const StyleSheet = {
  create: <T extends Record<string, unknown>>(styles: T): T => styles,
  flatten: <T>(style: T | T[]): T => (Array.isArray(style) ? style[0]! : style),
  hairlineWidth: 1,
  // Real RN registers these as opaque style objects; StatusBarBlend uses
  // them as array-style bases that later entries override per band.
  absoluteFill: {},
  absoluteFillObject: {},
};

const I18nManager = {
  isRTL: false,
};

// No system preference by default — matches a fresh test render where
// nothing has opted into AppThemeProvider's device-scheme following.
const useColorScheme = (): 'light' | 'dark' | null => null;

// Skeleton.tsx is the only consumer — a real animated value isn't needed
// for a snapshot (which captures one static frame), just something that
// doesn't throw when `.setValue`/interpolation-adjacent code touches it.
class AnimatedValue {
  constructor(private value: number) {}
  setValue(value: number): void {
    this.value = value;
  }
}
const Animated = {
  Value: AnimatedValue,
  View: 'Animated.View',
  timing: () => ({ start: () => {}, stop: () => {} }),
  spring: () => ({ start: () => {}, stop: () => {} }),
  sequence: () => ({ start: () => {}, stop: () => {} }),
  parallel: () => ({ start: () => {}, stop: () => {} }),
  loop: () => ({ start: () => {}, stop: () => {} }),
};

const Text = 'Text';
const View = 'View';
const Image = 'Image';
const TouchableOpacity = 'TouchableOpacity';
const TouchableWithoutFeedback = 'TouchableWithoutFeedback';
const Pressable = 'Pressable';
const ScrollView = 'ScrollView';
const ActivityIndicator = 'ActivityIndicator';
const TextInput = 'TextInput';
const Modal = 'Modal';
const KeyboardAvoidingView = 'KeyboardAvoidingView';

// BottomSheet.tsx is the only consumer — a fixed size is enough for a
// snapshot (which captures one static frame), not a real measured window.
const Dimensions = {
  get: () => ({ width: 390, height: 844 }),
};

// BottomSheet.tsx is the only consumer — gestures are never simulated in a
// snapshot render, so `panHandlers` just needs to exist as a spreadable
// object, not actually respond to touches.
const PanResponder = {
  create: () => ({ panHandlers: {} }),
};

// A real (if minimal) implementation, not an opaque tag: screens rely on
// FlatList actually mapping `data` through `renderItem`/`ListEmptyComponent`
// for their content to show up in a snapshot at all.
function FlatList<T>({
  data,
  renderItem,
  ListEmptyComponent,
  ListHeaderComponent,
  keyExtractor,
}: {
  data: readonly T[];
  renderItem: (info: { item: T; index: number }) => React.ReactNode;
  ListEmptyComponent?: React.ReactNode;
  ListHeaderComponent?: React.ReactNode;
  keyExtractor?: (item: T, index: number) => string;
}): React.ReactElement {
  return React.createElement(
    'FlatList',
    null,
    ListHeaderComponent ?? null,
    data.length === 0
      ? (ListEmptyComponent ?? null)
      : data.map((item, index) =>
          React.createElement(
            React.Fragment,
            { key: keyExtractor ? keyExtractor(item, index) : index },
            renderItem({ item, index }),
          ),
        ),
  );
}

export {
  Platform,
  StyleSheet,
  I18nManager,
  Animated,
  useColorScheme,
  Text,
  View,
  Image,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Pressable,
  ScrollView,
  ActivityIndicator,
  TextInput,
  Modal,
  KeyboardAvoidingView,
  Dimensions,
  PanResponder,
  FlatList,
};
