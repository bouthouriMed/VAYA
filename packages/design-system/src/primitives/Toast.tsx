import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import { Animated, Platform, Pressable, StyleSheet, View } from 'react-native';
import { Text } from './Text';
import { colors, radii, spacing, elevation } from '../tokens/index';

type ToastTone = 'success' | 'info' | 'warning' | 'error';

interface ToastOptions {
  message: string;
  tone?: ToastTone;
}

interface ToastItem extends ToastOptions {
  id: string;
}

const AUTO_DISMISS_MS = 3000;
const MAX_VISIBLE = 2;

const TONE_COLORS: Record<ToastTone, string> = {
  success: colors.success,
  info: colors.info,
  warning: colors.warning,
  error: colors.error,
};

const ToastContext = createContext<((options: ToastOptions) => void) | null>(null);

/** Non-blocking feedback for mutation results. Errors stay until tapped;
 *  everything else clears itself after a few seconds. */
export function useToast(): (options: ToastOptions) => void {
  const show = useContext(ToastContext);
  if (!show) throw new Error('useToast must be used within a ToastProvider');
  return show;
}

function ToastCard({ toast, onDismiss }: { toast: ToastItem; onDismiss: () => void }): React.JSX.Element {
  const translateY = useRef(new Animated.Value(-16)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.spring(translateY, { toValue: 0, friction: 9, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [translateY, opacity]);

  const tone = toast.tone ?? 'info';

  return (
    <Animated.View style={{ transform: [{ translateY }], opacity }}>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="alert"
        accessibilityLabel={toast.message}
        style={[styles.card, elevation?.lg]}
      >
        <View style={[styles.toneBar, { backgroundColor: TONE_COLORS[tone] }]} />
        <Text variant="bodySmall" color={colors.white} style={styles.message}>
          {toast.message}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function ToastProvider({ children }: { children: React.ReactNode }): React.JSX.Element {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const show = useCallback(
    (options: ToastOptions) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setToasts((prev) => [...prev, { ...options, id }].slice(-MAX_VISIBLE));
      if (options.tone !== 'error') {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), AUTO_DISMISS_MS),
        );
      }
    },
    [dismiss],
  );

  useEffect(() => {
    const currentTimers = timers.current;
    return () => {
      currentTimers.forEach((timer) => clearTimeout(timer));
      currentTimers.clear();
    };
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      <View style={styles.stack} pointerEvents="box-none">
        {toasts.map((toast) => (
          <ToastCard key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </View>
    </ToastContext.Provider>
  );
}

const styles = StyleSheet.create({
  stack: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 56 : 32,
    left: spacing.lg,
    right: spacing.lg,
    gap: spacing.sm,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.gray900,
    borderRadius: radii.lg,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
    shadowColor: colors.black,
  },
  toneBar: {
    width: 4,
    alignSelf: 'stretch',
    borderRadius: radii.full,
  },
  message: {
    flex: 1,
  },
});
