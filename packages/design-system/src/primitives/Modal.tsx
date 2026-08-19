import React, { useEffect, useRef } from 'react';
import {
  Modal as RNModal,
  Animated,
  Pressable,
  StyleSheet,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { Card } from './Card';
import { Text } from './Text';
import { Button } from './Button';
import { colors, spacing } from '../tokens/index';

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
}: ModalProps): React.JSX.Element {
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
          <Card style={styles.card}>
            {title ? (
              <Text variant="h3" style={styles.title}>
                {title}
              </Text>
            ) : null}
            {children}
            {confirmLabel && onConfirm ? (
              <View style={styles.actions}>
                <Pressable
                  onPress={onClose}
                  accessibilityRole="button"
                  accessibilityLabel={cancelLabel}
                  style={styles.cancelBtn}
                >
                  <Text variant="label" color={colors.gray700}>
                    {cancelLabel}
                  </Text>
                </Pressable>
                <Button
                  label={confirmLabel}
                  variant={confirmDestructive ? 'primary' : 'primary'}
                  onPress={onConfirm}
                  style={confirmDestructive ? styles.destructiveBtn : undefined}
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
    ...StyleSheet.absoluteFillObject,
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
    gap: spacing.lg,
    marginTop: spacing.sm,
  },
  cancelBtn: {
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.sm,
  },
  destructiveBtn: {
    backgroundColor: colors.error,
  },
});
