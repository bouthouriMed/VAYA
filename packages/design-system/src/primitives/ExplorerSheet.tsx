import React, { useEffect } from 'react';
import { StyleSheet, View, useWindowDimensions, type StyleProp, type ViewStyle } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, { useSharedValue, useAnimatedStyle, withSpring, runOnJS } from 'react-native-reanimated';
import { colors, radii, spacing, elevation } from '../tokens/index';
import type { AppPalette } from '../theme/palette';

interface ExplorerSheetProps {
  /** true = full form visible (normal state); false = collapsed to a thin
   *  draggable strip so the map behind it can dominate the screen. Unlike
   *  `BottomSheet` (a dismiss-modal that unmounts its content), this sheet
   *  always stays mounted — collapsing never destroys form/selection state. */
  expanded: boolean;
  /** Fired when a drag (or programmatic call) settles on the collapsed
   *  state — update the caller's `expanded` state here. */
  onCollapse: () => void;
  /** Fired when a drag settles back on the expanded state. */
  onExpand: () => void;
  /** Content shown while expanded — the normal Explorer form. */
  children: React.ReactNode;
  /** Thin content shown in the strip while collapsed (e.g. a one-line route
   *  summary) — optional, the drag handle alone is always shown. */
  collapsedContent?: React.ReactNode;
  theme?: AppPalette;
  /** Fraction of window height the sheet occupies when expanded. */
  expandedHeightRatio?: number;
  /** Height (px) of the strip left visible when collapsed. */
  collapsedHeight?: number;
  style?: StyleProp<ViewStyle>;
}

// Mirrors BottomSheet.tsx's critically-damped spring (damping >= 2*sqrt(stiffness))
// so this sheet settles instead of overshooting/bouncing — same physical feel
// across every sheet in the app.
const SPRING_CONFIG = { damping: 28, stiffness: 180, overshootClamping: true };
const VELOCITY_FLICK_THRESHOLD = 700;

/**
 * Which of the two snap points (0 = expanded, `collapsedTranslate` =
 * collapsed) a finished drag should settle on. A decisive flick wins
 * outright regardless of how far the drag got; otherwise settle toward
 * whichever snap point is physically closer — the same "intent must
 * dominate" spirit as BottomSheet's `isDismissalDrag`, adapted to a
 * two-way snap instead of dismiss-only. Pure and exported so the decision
 * itself is unit-testable without mounting gesture-handler/reanimated.
 */
export function pickSnapTarget(
  currentTranslateY: number,
  velocityY: number,
  collapsedTranslate: number,
): number {
  'worklet';
  if (velocityY > VELOCITY_FLICK_THRESHOLD) return collapsedTranslate;
  if (velocityY < -VELOCITY_FLICK_THRESHOLD) return 0;
  return currentTranslateY > collapsedTranslate / 2 ? collapsedTranslate : 0;
}

/**
 * The inline, always-mounted counterpart to `BottomSheet` (which is a
 * dismiss-modal). Where BottomSheet answers "show/hide a selection UI over
 * whatever's behind it", ExplorerSheet answers "let the user drag between a
 * form-dominant and a map-dominant presentation of the SAME screen" — the
 * map is a normal sibling behind this component, not a modal backdrop, and
 * nothing unmounts on collapse. Built for Publish's map-selection mode
 * (docs: Publish Explorer spec) but generic enough for Search's map-first
 * screens to adopt later without a second implementation.
 */
export function ExplorerSheet({
  expanded,
  onCollapse,
  onExpand,
  children,
  collapsedContent,
  theme,
  expandedHeightRatio = 0.62,
  collapsedHeight = 96,
  style,
}: ExplorerSheetProps): React.JSX.Element {
  const { height: windowHeight } = useWindowDimensions();
  const expandedHeight = windowHeight * expandedHeightRatio;
  const collapsedTranslate = Math.max(expandedHeight - collapsedHeight, 0);

  const translateY = useSharedValue(expanded ? 0 : collapsedTranslate);

  useEffect(() => {
    translateY.value = withSpring(expanded ? 0 : collapsedTranslate, SPRING_CONFIG);
    // Re-run only when the target state (or the geometry it's measured
    // against) actually changes, not on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded, collapsedTranslate]);

  function settle(target: number): void {
    'worklet';
    translateY.value = withSpring(target, SPRING_CONFIG);
    if (target === 0) {
      runOnJS(onExpand)();
    } else {
      runOnJS(onCollapse)();
    }
  }

  const dragGesture = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .failOffsetX([-15, 15])
    .onUpdate((e) => {
      const base = expanded ? 0 : collapsedTranslate;
      const next = base + e.translationY;
      translateY.value = Math.max(0, Math.min(collapsedTranslate, next));
    })
    .onEnd((e) => {
      settle(pickSnapTarget(translateY.value, e.velocityY, collapsedTranslate));
    });

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));
  // Crossfades the expanded content out and the collapsed strip in as the
  // sheet nears the collapsed snap point, instead of an abrupt content swap.
  const expandedContentStyle = useAnimatedStyle(() => ({
    opacity: 1 - Math.min(translateY.value / Math.max(collapsedTranslate, 1), 1),
  }));
  const collapsedContentStyle = useAnimatedStyle(() => ({
    opacity: Math.min(translateY.value / Math.max(collapsedTranslate, 1), 1),
  }));

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.sheet,
        elevation?.xl,
        theme ? { backgroundColor: theme.surface, shadowColor: theme.ink } : null,
        { height: expandedHeight },
        sheetAnimatedStyle,
        style,
      ]}
    >
      <GestureDetector gesture={dragGesture}>
        <View style={styles.handleArea}>
          <View style={[styles.handle, theme ? { backgroundColor: theme.outlineVariant } : null]} />
        </View>
      </GestureDetector>

      <Animated.View style={[styles.expandedContent, expandedContentStyle]} pointerEvents={expanded ? 'auto' : 'none'}>
        {children}
      </Animated.View>

      {collapsedContent ? (
        <Animated.View
          style={[styles.collapsedContent, collapsedContentStyle]}
          pointerEvents={expanded ? 'none' : 'auto'}
        >
          {collapsedContent}
        </Animated.View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: colors.white,
    borderTopLeftRadius: radii['2xl'],
    borderTopRightRadius: radii['2xl'],
    shadowColor: colors.gray900,
    shadowOffset: { width: 0, height: -6 },
    overflow: 'hidden',
  },
  handleArea: {
    alignItems: 'center',
    paddingTop: spacing.sm,
    paddingBottom: spacing.sm,
  },
  handle: {
    width: 40,
    height: 4,
    borderRadius: radii.full,
    backgroundColor: colors.gray300,
  },
  expandedContent: {
    flex: 1,
  },
  collapsedContent: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    paddingTop: spacing.xl + spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
});
