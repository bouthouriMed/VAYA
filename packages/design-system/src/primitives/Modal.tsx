import React, { useEffect, useRef } from 'react';
import {
  Modal as RNModal,
  Animated,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Card } from './Card';
import { Text } from './Text';
import { Button } from './Button';
import { ABSOLUTE_FILL_OBJECT } from '../utils/absoluteFill';
import { spacing } from '../tokens/index';
import type { AppPalette } from '../theme/palette';
import { useAppTheme } from '../theme/AppThemeProvider';

interface ModalProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  children?: React.ReactNode;
  /** Convenience for the common confirm/cancel shape (e.g. "cancel this
   *  booking?") — omit both and just use children for anything richer. */
  confirmLabel?: string;
  onConfirm?: () => void;
  confirmDestructive?: boolean;
  cancelLabel?: string;
  /** Optional `useAppTheme()` override — when given, the card surface,
   *  title, cancel label, and destructive fill follow the live theme
   *  instead of the legacy static tokens, so a dialog opened from a
   *  dark-scheme screen doesn't render as a white plate with invisible
   *  theme-colored text inside it. */
  theme?: AppPalette;
}

/**
 * A centered overlay dialog, composing Card for its visual surface rather
 * than inventing a second card language. Uses RN's core Modal for
 * portal/layering/Android-back-button behavior — not a custom absolutely
 * positioned overlay, which would fight the platform on both of those.
 */
export function Modal({
  visible,
  onClose,
  title,
  children,
  confirmLabel,
  onConfirm,
  confirmDestructive,
  cancelLabel = 'Annuler',
  theme: themeOverride,
}: ModalProps): React.JSX.Element {
  const { colors: contextTheme } = useAppTheme();
  const theme = themeOverride ?? contextTheme;
  const scale = useRef(new Animated.Value(0.94)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!visible) return;
    Animated.parallel([
      Animated.spring(scale, { toValue: 1, friction: 8, tension: 90, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 160, useNativeDriver: true }),
    ]).start();
  }, [visible, scale, opacity]);

  return (
    <RNModal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <TouchableWithoutFeedback onPress={onClose}>
        <View style={styles.backdrop} />
      </TouchableWithoutFeedback>
      <View style={styles.centerWrap} pointerEvents="box-none">
        <Animated.View style={{ transform: [{ scale }], opacity, width: '100%' }}>
          <Card style={[styles.card, { backgroundColor: theme.surface }]}>
            {title ? (
              <Text variant="title" color={theme.ink} style={styles.title}>
                {title}
              </Text>
            ) : null}
            {children}
            {confirmLabel && onConfirm ? (
              <View style={styles.actions}>
                <Button variant="ghost" label={cancelLabel} onPress={onClose} theme={theme} />
                <Button
                  label={confirmLabel}
                  variant={confirmDestructive ? 'destructive' : 'primary'}
                  onPress={onConfirm}
                  theme={theme}
                />
              </View>
            ) : null}
          </Card>
        </Animated.View>
      </View>
    </RNModal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...ABSOLUTE_FILL_OBJECT,
    backgroundColor: 'rgba(38, 51, 58, 0.5)',
  },
  centerWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  card: {
    gap: spacing.md,
  },
  title: {
    marginBottom: spacing.xs,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
});
