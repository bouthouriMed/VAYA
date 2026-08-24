import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { Text } from './Text';
import { Icon, type IconName } from './Icon';
import { haptics } from '../utils/haptics';
import { colors, radii, spacing, elevation } from '../tokens/index';

type ToastTone = 'success' | 'info' | 'warning' | 'error';

interface ToastOptions {
  message: string;
  tone?: ToastTone;
}

interface ToastItem extends ToastOptions {
  id: string;
  /** Set once dismissal has been requested (tap, close icon, or the
   *  auto-timer) so the card plays its exit animation before it's actually
   *  removed. A swipe-dismissed card skips this — it animates itself away
   *  as a direct continuation of the user's own gesture instead. */
  closing: boolean;
}

// A beat longer than before: the new icon + message layout is a touch
// denser, and it should be comfortable to actually read, not just glimpsed.
const AUTO_DISMISS_MS = 3500;
const MAX_VISIBLE = 2;
const EXIT_DURATION_MS = 180;
const SWIPE_DISMISS_PX = 80;
const SWIPE_DISMISS_VELOCITY = 700;
const ENTER_SPRING = { damping: 16, stiffness: 220, overshootClamping: false };

const TONE_COLORS: Record<ToastTone, string> = {
  success: colors.success,
  info: colors.info,
  warning: colors.warning,
  error: colors.error,
};

// Translucent tints of TONE_COLORS for the leading icon badge — same
// hand-tinted-rgba convention colors.ts already uses for mapCorridorFill /
// mapRouteLineFaint, not a new pattern.
const TONE_TINTS: Record<ToastTone, string> = {
  success: 'rgba(88, 117, 102, 0.18)',
  info: 'rgba(91, 125, 138, 0.18)',
  warning: 'rgba(176, 138, 78, 0.18)',
  error: 'rgba(166, 92, 78, 0.18)',
};

const TONE_ICONS: Record<ToastTone, IconName> = {
  success: 'checkmark-circle',
  info: 'information-circle',
  warning: 'warning',
  error: 'alert-circle',
};

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** Non-blocking feedback for mutation results. Errors stay until dismissed;
 *  everything else clears itself after a few seconds. */
export function useToast(): (options: ToastOptions) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used within a ToastProvider');
  return show;
}

/** Pure dismissal-intent check for a finished swipe — mirrors BottomSheet's
 *  isDismissalDrag. A genuine swipe-away (sideways in either direction, or
 *  upward off the top of the stack) past a distance or velocity threshold
 *  dismisses; a downward drag never does — there's nothing above the toast
 *  for it to reveal, so it would read as the card falling, not being swiped
 *  away. Exported standalone (not inlined in the gesture callback) so it can
 *  be unit-tested the same way isDismissalDrag is. */
export function isSwipeDismiss(e: {
  translationX: number;
  translationY: number;
  velocityX: number;
  velocityY: number;
}): boolean {
  'worklet';
  const sidewaysDrag = Math.abs(e.translationX) > SWIPE_DISMISS_PX;
  const upwardDrag = e.translationY < -SWIPE_DISMISS_PX;
  const sidewaysFlick = Math.abs(e.velocityX) > SWIPE_DISMISS_VELOCITY;
  const upwardFlick = e.velocityY < -SWIPE_DISMISS_VELOCITY;
  return sidewaysDrag || upwardDrag || sidewaysFlick || upwardFlick;
}

interface ToastCardProps {
  toast: ToastItem;
  /** Newest toast in the (max 2-deep) stack renders at full strength; an
   *  older one still winding down behind it dims slightly so attention
   *  reads as "one active message", not two competing banners. */
  isTop: boolean;
  onRequestClose: () => void;
  onRemove: () => void;
}

function ToastCard({ toast, isTop, onRequestClose, onRemove }: ToastCardProps): React.JSX.Element {
  const translateY = useSharedValue(-24);
  const translateX = useSharedValue(0);
  const opacity = useSharedValue(0);
  const restingOpacity = isTop ? 1 : 0.82;

  // Entrance slide-in — runs once on mount.
  useEffect(() => {
    translateY.value = withSpring(0, ENTER_SPRING);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Opacity target: fades in to restingOpacity (also handles re-dimming when
  // a second toast arrives and this one is no longer top), or — once
  // dismissal has been requested — fades out and slides back up, then hands
  // off to onRemove so the provider actually drops it from state.
  useEffect(() => {
    if (toast.closing) {
      opacity.value = withTiming(0, { duration: EXIT_DURATION_MS });
      translateY.value = withTiming(-24, { duration: EXIT_DURATION_MS }, (finished) => {
        if (finished) runOnJS(onRemove)();
      });
      return;
    }
    opacity.value = withTiming(restingOpacity, { duration: 180 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [toast.closing, restingOpacity]);

  const tone = toast.tone ?? 'info';
  const toneColor = TONE_COLORS[tone];

  // Swipe away in any direction to dismiss — the mobile-native gesture for
  // clearing a notification, instead of requiring a precise tap. Small
  // activation offsets (matching BottomSheet's own drag gesture) so a plain
  // tap still reaches the Pressable below untouched.
  const swipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .activeOffsetY([-10, 10])
    .onUpdate((e) => {
      translateX.value = e.translationX;
      translateY.value = e.translationY;
    })
    .onEnd((e, success) => {
      if (!success) return;
      if (isSwipeDismiss(e)) {
        const direction = e.velocityX !== 0 ? Math.sign(e.velocityX) : Math.sign(e.translationX) || 1;
        translateX.value = withTiming(e.translationX + direction * 60, { duration: 160 });
        translateY.value = withTiming(Math.min(e.translationY, 0) - 40, { duration: 160 });
        opacity.value = withTiming(0, { duration: 160 }, (finished) => {
          if (finished) runOnJS(onRemove)();
        });
      } else {
        translateX.value = withSpring(0, ENTER_SPRING);
        translateY.value = withSpring(0, ENTER_SPRING);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ translateX: translateX.value }, { translateY: translateY.value }],
  }));

  return (
    <GestureDetector gesture={swipeGesture}>
      <Animated.View style={animatedStyle}>
        <Pressable
          onPress={onRequestClose}
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          accessibilityLabel={toast.message}
          style={[styles.card, elevation?.lg]}
        >
          <View style={[styles.iconBadge, { backgroundColor: TONE_TINTS[tone] }]}>
            <Icon name={TONE_ICONS[tone]} size="sm" color={toneColor} />
          </View>
          <Text variant="bodySmall" color={colors.white} style={styles.message}>
            {toast.message}
          </Text>
          <Pressable
            onPress={onRequestClose}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel="Fermer"
            style={styles.closeTarget}
          >
            <Icon name="close" size="xs" color={colors.gray400} />
          </Pressable>
        </Pressable>
      </Animated.View>
    </GestureDetector>
  );
}

export function ToastProvider({
  children,
  topInset,
}: {
  children: React.ReactNode;
  /** Real device inset — pass `useSafeAreaInsets().top` from the app root so
   *  the stack clears the status bar / notch / Dynamic Island exactly on
   *  every device instead of guessing one fixed offset per platform. Falls
   *  back to that old guess when no inset is available (e.g. this package's
   *  own tests, or a caller with no SafeAreaProvider ancestor). */
  topInset?: number;
}): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  /** Actually drops a toast from state — only ever called once its exit
   *  animation (closing-effect or swipe-away) has finished playing. */
  const remove = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.filter((t) => t.id !== id));
    },
    [clearTimer],
  );

  /** Starts a toast's dismissal — cancels its auto-timer and flips
   *  `closing`, which triggers ToastCard's exit animation. Used by tap, the
   *  close icon, and the auto-dismiss timer alike, so every non-swipe exit
   *  plays the same animation. */
  const requestClose = useCallback(
    (id: string) => {
      clearTimer(id);
      setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, closing: true } : t)));
    },
    [clearTimer],
  );

  const show = useCallback(
    (options: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { ...options, id, closing: false }].slice(-MAX_VISIBLE));

      // Haptics are already this app's established sensory signature for
      // mutation outcomes (OTP verify, booking, ride publish) — a toast
      // reporting the same kind of outcome should feel the same way.
      switch (options.tone) {
        case 'error':
          haptics.error();
          break;
        case 'warning':
          haptics.warning();
          break;
        case 'success':
          haptics.success();
          break;
        default:
          haptics.selection();
      }

      if (options.tone !== 'error') {
        timers.current.set(
          id,
          setTimeout(() => requestClose(id), AUTO_DISMISS_MS),
        );
      }
    },
    [requestClose],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  const topOffset = topInset != null ? topInset + spacing.sm : Platform.OS === 'ios' ? 56 : 32;

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View style={{ ...styles.stack, top: topOffset }} pointerEvents="box-none">
        {toasts.map((toast, index) => (
          <ToastCard
            key={toast.id}
            toast={toast}
            isTop={index === toasts.length - 1}
            onRequestClose={() => requestClose(toast.id)}
            onRemove={() => remove(toast.id)}
          />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    backgroundColor: colors.primaryDark,
    borderRadius: radii.xl,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.black,
  },
  iconBadge: {
    width: spacing['3xl'],
    height: spacing['3xl'],
    borderRadius: radii.full,
    alignItems: 'center',
    justifyContent: 'center',
  },
  message: {
    flex: 1,
  },
  closeTarget: {
    alignItems: 'center',
    justifyContent: 'center',
  },
});
