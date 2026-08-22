import React from 'react';

// Real react-native-gesture-handler is a native module — not resolvable in
// the vitest 'node' test environment. GestureDetector just renders its
// child (elements are never actually rendered/gestured here, only
// imported/instantiated for smoke and snapshot tests); Gesture.Pan()'s
// builder methods are no-ops that return the same chainable object,
// matching the real fluent-config API's shape without any behavior.
export const GestureHandlerRootView = 'GestureHandlerRootView';
export const ScrollView = 'ScrollView';

export function GestureDetector({ children }: { children: React.ReactNode }): React.ReactNode {
  return children;
}

interface MockPanGesture {
  onStart: (...args: unknown[]) => MockPanGesture;
  onUpdate: (...args: unknown[]) => MockPanGesture;
  onEnd: (...args: unknown[]) => MockPanGesture;
  onFinalize: (...args: unknown[]) => MockPanGesture;
  activeOffsetX: (...args: unknown[]) => MockPanGesture;
  activeOffsetY: (...args: unknown[]) => MockPanGesture;
  failOffsetX: (...args: unknown[]) => MockPanGesture;
  failOffsetY: (...args: unknown[]) => MockPanGesture;
  simultaneousWithExternalGesture: (...args: unknown[]) => MockPanGesture;
  requireExternalGestureToFail: (...args: unknown[]) => MockPanGesture;
}

function panGesture(): MockPanGesture {
  const self: MockPanGesture = {
    onStart: () => self,
    onUpdate: () => self,
    onEnd: () => self,
    onFinalize: () => self,
    activeOffsetX: () => self,
    activeOffsetY: () => self,
    failOffsetX: () => self,
    failOffsetY: () => self,
    simultaneousWithExternalGesture: () => self,
    requireExternalGestureToFail: () => self,
  };
  return self;
}

export const Gesture = {
  Pan: panGesture,
};

export const State = {
  UNDETERMINED: 0,
  FAILED: 1,
  BEGAN: 2,
  CANCELLED: 3,
  ACTIVE: 4,
  END: 5,
};
