import React, { forwardRef, useImperativeHandle, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, type LayoutChangeEvent } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring } from 'react-native-reanimated';
import { radii, spacing, elevation } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

// Tall enough to be a comfortable drag target and to read clearly as "there's
// more below" once collapsed, short enough that collapsing meaningfully
// reveals the map behind it.
const PEEK_HEIGHT = 44;
const SPRING_CONFIG = { damping: 28, stiffness: 220, overshootClamping: true };
const FLING_VELOCITY = 700;

export interface DraggableMapSheetHandle {
  /** Animates back to fully expanded — e.g. call this when a fresh
   *  selection is made on the map behind a collapsed sheet, so the newly
   *  relevant content (and its confirm action) is immediately visible again
   *  instead of leaving the user to notice and drag it up themselves. */
  expand: () => void;
}

interface DraggableMapSheetProps {
  theme: AppPalette;
  children: React.ReactNode;
  /** Extra bottom padding — pass safe-area inset so content clears the home
   *  indicator / nav bar once the sheet floats above the screen edge. */
  bottomInset?: number;
}

/**
 * A docked panel over a full-bleed map — not a modal (nothing backdrops or
 * unmounts): it drags between fully expanded (its natural content height)
 * and a collapsed peek (just the handle, `PEEK_HEIGHT` tall), so a map-first
 * picking screen (search/pickup-point.tsx, search/dropoff-point.tsx) can let
 * the map breathe without forcing the user to leave the screen or manually
 * zoom out to see what a fixed-height footer was covering. Dragging or
 * tapping the handle both restore it — a drag-only affordance is easy to
 * miss, so tap is the second, more discoverable way back.
 *
 * Floats with a horizontal margin and full corner radius (not edge-to-edge)
 * so it reads as a card sitting on the map, not a flush panel — the same
 * "premium floating surface" language MapCanvas's own rounded corners
 * already use elsewhere in the app, rather than a screen-width slab whose
 * only visible rounding is its top two corners.
 *
 * Only the handle strip carries the pan gesture — content (buttons, rows)
 * stays fully interactive with no gesture-priority negotiation needed, since
 * dragging is never initiated from inside it.
 */
export const DraggableMapSheet = forwardRef<DraggableMapSheetHandle, DraggableMapSheetProps>(
  function DraggableMapSheet({ theme, children, bottomInset = 0 }, ref) {
    const [contentHeight, setContentHeight] = useState(0);
    const translateY = useSharedValue(0);
    const startY = useSharedValue(0);
    const collapseOffset = Math.max(0, contentHeight - PEEK_HEIGHT);

    useImperativeHandle(ref, () => ({
      expand: () => {
        translateY.value = withSpring(0, SPRING_CONFIG);
      },
    }));

    const panGesture = Gesture.Pan()
      .onStart(() => {
        startY.value = translateY.value;
      })
      .onUpdate((e) => {
        const next = startY.value + e.translationY;
        translateY.value = Math.max(0, Math.min(collapseOffset, next));
      })
      .onEnd((e) => {
        const shouldCollapse =
          e.velocityY > FLING_VELOCITY ||
          (e.velocityY > -FLING_VELOCITY && translateY.value > collapseOffset / 2);
        translateY.value = withSpring(shouldCollapse ? collapseOffset : 0, SPRING_CONFIG);
      });

    function toggleFromTap(): void {
      translateY.value = withSpring(translateY.value > 0 ? 0 : collapseOffset, SPRING_CONFIG);
    }

    const animatedStyle = useAnimatedStyle(() => ({
      transform: [{ translateY: translateY.value }],
    }));

    return (
      <Animated.View
        onLayout={(e: LayoutChangeEvent) => setContentHeight(e.nativeEvent.layout.height)}
        style={[
          styles.sheet,
          elevation?.xl,
          styles.shadowDirection,
          {
            backgroundColor: theme.surface,
            shadowColor: theme.ink,
            paddingBottom: bottomInset + spacing.md,
          },
          animatedStyle,
        ]}
      >
        <GestureDetector gesture={panGesture}>
          <TouchableOpacity
            activeOpacity={1}
            onPress={toggleFromTap}
            style={styles.handleArea}
            accessibilityRole="button"
            accessibilityLabel="Glisser ou appuyer pour agrandir ou réduire ce panneau"
            accessibilityHint="Réduire révèle plus de la carte, agrandir montre les détails"
          >
            <View style={[styles.handle, { backgroundColor: theme.outlineVariant }]} />
          </TouchableOpacity>
        </GestureDetector>
        <View style={styles.content}>{children}</View>
      </Animated.View>
    );
  },
);

const styles = StyleSheet.create({
  sheet: {
    marginHorizontal: spacing.md,
    borderRadius: radii['2xl'],
    overflow: 'hidden',
  },
  shadowDirection: {
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.full,
  },
  content: {
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
});
