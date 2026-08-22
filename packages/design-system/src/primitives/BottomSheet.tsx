import React, { useEffect } from 'react';
import { BackHandler, Dimensions, KeyboardAvoidingView, Platform, StyleSheet, TouchableWithoutFeedback, View, Modal as RNModal } from 'react-native';
import { GestureDetector, Gesture, GestureHandlerRootView } from 'react-native-gesture-handler';
import type { PanGesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS } from 'react-native-reanimated';
import { BlurView } from 'expo-blur';
import { Text } from './Text';
import { colors, radii, spacing, elevation } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

interface BottomSheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  /** Replaces the default title `Text` inside the draggable handle area —
   *  for a caller whose header is more than a plain string (e.g. a
   *  centered title with its own close button). */
  headerContent?: React.ReactNode;
  children: React.ReactNode;
  /** Fraction of screen height the sheet occupies when open. */
  heightRatio?: number;
  /** A gesture living inside `children` that competes with this sheet's own
   *  drag-to-dismiss for the same touches (e.g. DateCalendarSheet's
   *  horizontal month-swipe). `activeOffsetY`/`failOffsetX` alone don't
   *  guarantee exclusivity between two independently-negotiated gestures on
   *  nested `GestureDetector`s — passing it here makes the dismiss gesture
   *  explicitly `requireExternalGestureToFail` it, so a touch that the
   *  content gesture claims can never also trigger dismiss. */
  contentGesture?: PanGesture;
  /** Optional `useAppTheme()` override (Stitch migration) — when given, the
   *  sheet surface/handle/title follow the live theme instead of the
   *  legacy static `colors` token. Unused anywhere this primitive hasn't
   *  been migrated yet. */
  theme?: AppPalette;
}

const DISMISS_DRAG_PX = 100;
const DISMISS_VELOCITY = 800;

/**
 * Whether a finished pan is a genuine dismiss gesture. Vertical intent must
 * DOMINATE on both position and velocity — not merely clear the thresholds.
 *
 * This is the fix for the calendar-sheets regression: DateCalendarSheet's
 * month-swipe (failOffsetY 15) and this sheet's dismiss drag (activeOffsetY
 * 10) race on every touch, and a rightward month-swipe with slight downward
 * drift can cross dy>10 first — the month gesture then FAILS (its own
 * failOffsetY), which unblocks ours via requireExternalGestureToFail, and a
 * long diagonal accumulates >100px of translationY even though the user's
 * intent was horizontal. Thresholds alone closed the whole sheet on that
 * swipe; requiring |ty|>|tx| (and |vy|>|vx| for flicks) makes dismissal
 * impossible unless the gesture was really vertical.
 */
export function isDismissalDrag(e: {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
}): boolean {
  const verticalDrag =
    e.translationY > DISMISS_DRAG_PX && Math.abs(e.translationY) > Math.abs(e.translationX);
  const verticalFlick =
    e.velocityY > DISMISS_VELOCITY && Math.abs(e.velocityY) > Math.abs(e.velocityX);
  return verticalDrag || verticalFlick;
}
// damping must be >= ~2*sqrt(stiffness) (here ~26.8) to be critically damped;
// the previous {18, 180} was well underdamped, so the open animation flew
// past translateY 0 and visibly bounced back down into place instead of
// settling directly.
const SPRING_CONFIG = { damping: 28, stiffness: 180, overshootClamping: true };

/**
 * A modal sheet anchored to the bottom of the screen — the standard pattern
 * for selection UIs (stop pickers, filters, ride details) that don't
 * warrant a full route change. Backdrop tap and swipe-down both dismiss.
 *
 * Built on react-native-gesture-handler + react-native-reanimated (both
 * already real, direct app dependencies — required by Expo Router's own
 * native-stack transitions — not a new footprint). An earlier version was
 * built on RN core `Animated` + `PanResponder` instead; that turned out to
 * be genuinely unreliable specifically because this sheet's content is
 * dense with `TouchableOpacity`s (day cells, buttons) — plain
 * `PanResponder` negotiates touch-responder hand-off with nested
 * Touchables on the JS thread, and that hand-off is a well-known weak
 * spot: it can silently fail to hand the gesture up at all. GestureHandler
 * runs its recognizers on the native/UI thread with real exclusivity
 * rules, which is exactly why it's the standard tool for "draggable
 * container with interactive content inside" — not swapped in lightly, but
 * because the simpler approach demonstrably didn't work here.
 *
 * Requires `<GestureHandlerRootView>` mounted at the app root
 * (apps/mobile/app/_layout.tsx) for the app's own screens, AND a second one
 * scoped inside this component's own `<Modal>` (below) — Modal renders into
 * a separate native view hierarchy the app-root one never reaches, so
 * without this second root gesture recognizers here don't register right.
 */
export function BottomSheet({
  visible,
  onClose,
  title,
  headerContent,
  children,
  heightRatio = 0.6,
  theme,
  contentGesture,
}: BottomSheetProps): React.JSX.Element {
  const screenHeight = Dimensions.get('window').height;
  const sheetHeight = screenHeight * heightRatio;
  const translateY = useSharedValue(sheetHeight);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      translateY.value = sheetHeight;
      translateY.value = withSpring(0, SPRING_CONFIG);
      backdropOpacity.value = withTiming(1, { duration: 200 });
    }
    // Only re-run on visibility change, not on every sheetHeight recompute.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  // While the sheet is open, hardware/system back (including Android's
  // edge-swipe back gesture) must close THIS sheet and nothing else —
  // returning true consumes the event so it can never reach react
  // navigation's handler and pop the screen (or tab stack) underneath.
  // BackHandler dispatch is LIFO, so this later-registered subscription
  // always wins over the navigator's. The RNModal's own onRequestClose is
  // kept as a second net; this explicit handler is the one that actually
  // guarantees exclusivity on predictive-back devices.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      close();
      return true;
    });
    return () => sub.remove();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function close(): void {
    'worklet';
    translateY.value = withTiming(sheetHeight, { duration: 220 }, (finished) => {
      if (finished) runOnJS(onClose)();
    });
    backdropOpacity.value = withTiming(0, { duration: 220 });
  }

  // Vertical-only, and yields to a horizontal sibling gesture (e.g.
  // DateCalendarSheet's month swipe) via failOffsetX. That alone isn't a
  // hard guarantee of exclusivity between two independently-negotiated
  // gestures on nested GestureDetectors, though — hence also explicitly
  // requiring `contentGesture` (when given) to fail first below, which is
  // what actually makes a touch the content gesture claims unable to also
  // trigger dismiss.
  let dragGesture = Gesture.Pan()
    .activeOffsetY(10)
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      // Only follow the finger while vertical intent dominates — a
      // horizontal-leaning touch (calendar month-swipe with drift, see
      // isDismissalDrag) must never drag the sheet down even visually.
      if (e.translationY > 0 && Math.abs(e.translationY) > Math.abs(e.translationX)) {
        translateY.value = e.translationY;
      }
    })
    .onEnd((e, success) => {
      // gesture-handler still invokes onEnd when a gesture never actually
      // activated (e.g. it FAILED via failOffsetX because the touch was a
      // horizontal swipe on DateCalendarSheet's grid) — without this guard,
      // that failed touch's leftover translation/velocity numbers (which
      // can carry a nonzero Y component even on a mostly-horizontal real
      // swipe) were still evaluated against the dismiss thresholds, closing
      // the sheet on a drag that was never a vertical drag at all.
      if (!success) return;
      if (isDismissalDrag(e)) {
        close();
      } else {
        translateY.value = withSpring(0, SPRING_CONFIG);
      }
    });
  if (contentGesture) {
    dragGesture = dragGesture.requireExternalGestureToFail(contentGesture);
  }

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  if (!visible) return <></>;

  return (
    <RNModal visible={visible} transparent animationType="none" onRequestClose={close}>
      {/* RN's Modal renders its content in a separate native view hierarchy
       *  (its own UIWindow on iOS) that the app-root GestureHandlerRootView
       *  (apps/mobile/app/_layout.tsx, mounted OUTSIDE this Modal) never
       *  reaches — gesture-handler's own documented caveat. Without a
       *  second root scoped to the Modal's content, gesture recognition and
       *  relations here (requireExternalGestureToFail included) silently
       *  run without proper native supervision. */}
      <GestureHandlerRootView style={styles.rootView}>
        <TouchableWithoutFeedback onPress={close}>
          <Animated.View style={[styles.backdrop, backdropAnimatedStyle]}>
            {/* A frosted, not just darkened, backdrop — separates the sheet
             *  from whatever's behind it (map, screen content) more clearly.
             *  Android has no real compositor blur without this flag; the
             *  tinted `backdrop` background underneath is what carries the
             *  effect there instead. */}
            <BlurView intensity={30} tint="dark" experimentalBlurMethod="dimezisBlurView" style={StyleSheet.absoluteFillObject} />
          </Animated.View>
        </TouchableWithoutFeedback>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardWrap}
          pointerEvents="box-none"
        >
          <GestureDetector gesture={dragGesture}>
            <Animated.View
              style={[
                styles.sheet,
                elevation?.xl,
                // A sheet anchored to the bottom edge should cast its shadow
                // upward, not in the token's default downward direction
                // (Android's `elevation` has no directional component, so this
                // only affects iOS).
                styles.sheetShadowDirection,
                theme ? { backgroundColor: theme.surface, shadowColor: theme.ink } : null,
                { height: sheetHeight },
                sheetAnimatedStyle,
              ]}
            >
              <View style={styles.handleArea}>
                <View style={[styles.handle, theme ? { backgroundColor: theme.outlineVariant } : null]} />
                {headerContent ??
                  (title ? (
                    <Text variant="h3" color={theme?.ink} style={styles.title}>
                      {title}
                    </Text>
                  ) : null)}
              </View>
              <View style={styles.content}>{children}</View>
            </Animated.View>
          </GestureDetector>
        </KeyboardAvoidingView>
      </GestureHandlerRootView>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  rootView: {
    flex: 1,
  },
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
