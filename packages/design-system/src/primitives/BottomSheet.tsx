import React, { useEffect, useRef } from 'react';
import {
  Animated,
  Dimensions,
  KeyboardAvoidingView,
  PanResponder,
  Platform,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
  Modal as RNModal,
} from 'react-native';
import { Text } from './Text';
import { colors, radii, spacing, elevation } from '../tokens/index';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Fraction of screen height the sheet occupies when open. */
  heightRatio?: number;
}

const DISMISS_DRAG_PX = 100;
const DISMISS_VELOCITY = 0.8;

/**
 * A modal sheet anchored to the bottom of the screen — the standard pattern
 * for selection UIs (stop pickers, filters, ride details) that don't
 * warrant a full route change. Backdrop tap and swipe-down both dismiss.
 *
 * Built on RN's core Animated + PanResponder rather than Reanimated +
 * react-native-gesture-handler: no other primitive in this package uses
 * either yet, and a spring/pan-driven sheet doesn't need the UI-thread
 * gesture system those add — core RN handles this interaction fine and
 * avoids a new peer-dependency + test-mock surface for this phase.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  children,
  heightRatio = 0.6,
}: BottomSheetProps): React.JSX.Element {
  const screenHeight = Dimensions.get('window').height;
  const sheetHeight = screenHeight * heightRatio;
  const translateY = useRef(new Animated.Value(sheetHeight)).current;
  const backdropOpacity = useRef(new Animated.Value(0)).current;

  const close = (): void => {
    Animated.parallel([
      Animated.timing(translateY, { toValue: sheetHeight, duration: 220, useNativeDriver: true }),
      Animated.timing(backdropOpacity, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start(() => onClose());
  };

  useEffect(() => {
    if (visible) {
      translateY.setValue(sheetHeight);
      Animated.parallel([
        Animated.spring(translateY, { toValue: 0, friction: 10, tension: 65, useNativeDriver: true }),
        Animated.timing(backdropOpacity, { toValue: 1, duration: 200, useNativeDriver: true }),
      ]).start();
    }
    // Only re-run on visibility change, not on every sheetHeight recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_evt, gesture) => gesture.dy > 4,
      onPanResponderMove: (_evt, gesture) => {
        if (gesture.dy > 0) translateY.setValue(gesture.dy);
      },
      onPanResponderRelease: (_evt, gesture) => {
        if (gesture.dy > DISMISS_DRAG_PX || gesture.vy > DISMISS_VELOCITY) {
          close();
        } else {
          Animated.spring(translateY, { toValue: 0, friction: 10, useNativeDriver: true }).start();
        }
      },
    }),
  ).current;

  if (!visible) return <></>;

  return (
    <RNModal visible={visible} transparent animationType="none" onRequestClose={close}>
      <TouchableWithoutFeedback onPress={close}>
        <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]} />
      </TouchableWithoutFeedback>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.keyboardWrap}
        pointerEvents="box-none"
      >
        <Animated.View
          style={[
            styles.sheet,
            elevation?.xl,
            // A sheet anchored to the bottom edge should cast its shadow
            // upward, not in the token's default downward direction
            // (Android's `elevation` has no directional component, so this
            // only affects iOS).
            styles.sheetShadowDirection,
            { height: sheetHeight, transform: [{ translateY }] },
          ]}
        >
          <View {...panResponder.panHandlers} style={styles.handleArea}>
            <View style={styles.handle} />
            {title ? (
              <Text variant="h3" style={styles.title}>
                {title}
              </Text>
            ) : null}
          </View>
          <View style={styles.content}>{children}</View>
        </Animated.View>
      </KeyboardAvoidingView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(38, 51, 58, 0.5)',
  },
  keyboardWrap: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    shadowColor: colors.gray900,
  },
  sheetShadowDirection: {
    shadowOffset: { width: 0, height: -6 },
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
    gap: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.gray300,
  },
  title: {
    paddingHorizontal: spacing.lg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.lg,
  },
});
