import React, { useEffect, useMemo, useRef, useState } from 'react';
import { View, TouchableOpacity, StyleSheet, Platform } from 'react-native';
// gesture-handler's ScrollView (not RN core's) — it wraps a
// NativeViewGestureHandler that properly participates in the same gesture
// arena as BottomSheet's outer Gesture.Pan() drag-to-dismiss. A plain RN
// ScrollView nested under that Pan doesn't negotiate with it at all, so
// vertical wheel-scroll touches would get raced/stolen by the sheet's own
// drag gesture instead of scrolling the wheel.
import { ScrollView, type ScrollView as GHScrollView } from 'react-native-gesture-handler';
import Animated, {
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  interpolate,
  interpolateColor,
  Extrapolation,
  runOnJS,
  type SharedValue,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { BottomSheet } from './BottomSheet';
import { Text } from './Text';
import { Icon } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import { haptics } from '../utils/haptics';
import { roundUpToSlot, isSameDay } from '../utils/scheduling';
import type { AppPalette } from '../theme/palette';

export interface TimeWheelSheetProps {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onChange: (date: Date) => void;
  title?: string;
  closeLabel?: string;
  subtitleLabel?: string;
  /** "Rechercher vers {{time}}" by default — pass a function so callers
   *  can place the time however their language's word order needs. */
  summaryLabel?: (time: string) => string;
  confirmLabel?: string;
}

const ITEM_HEIGHT = 48;
const VISIBLE_COUNT = 5;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;
const PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2);
const MINUTE_STEP = 5;
const COLUMN_WIDTH = 80;
const SEPARATOR_WIDTH = 20;
// One constant text size for every row, selected or not — emphasis comes
// entirely from a scale transform + color/opacity interpolation (below),
// never from swapping fontSize/lineHeight. A size swap changes the text
// node's own layout metrics mid-scroll, and different sizes of the same
// glyph don't share an optical center in every font — that mismatch is
// exactly what reads as "the numbers don't sit in the box." A transform
// never touches layout at all, so the centered point never moves.
const ITEM_FONT_SIZE = 22;
const ITEM_LINE_HEIGHT = ITEM_HEIGHT;
const CENTER_SCALE = 1.12;
const EDGE_SCALE = 0.82;
const EDGE_OPACITY = 0.35;
// `transform: scale` grows a row visually around its own center without
// changing its layout box — at CENTER_SCALE the centered row's rendered
// height becomes ITEM_HEIGHT * CENTER_SCALE, which is taller than
// ITEM_HEIGHT itself. The highlight box (a separate, fixed-size sibling
// View) must be sized to actually contain that, not just the unscaled row
// — this is what "the numbers sit outside the box" was: the box was sized
// to ITEM_HEIGHT while the emphasized number rendered taller than it.
const HIGHLIGHT_HEIGHT = Math.ceil(ITEM_HEIGHT * CENTER_SCALE);
// Same reasoning horizontally, plus a little extra breathing room — two
// digits have far more natural slack inside an 80px column than the row
// has vertically inside 48px, but the box should still never hug the
// scaled-up state edge-to-edge.
const HIGHLIGHT_WIDTH = Math.ceil((COLUMN_WIDTH * 2 + SEPARATOR_WIDTH) * CENTER_SCALE) + spacing.md;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

/** One wheel row. Its scale/opacity/color are a continuous function of how
 *  far it currently sits from the column's vertical center — driven by the
 *  shared scroll position on the UI thread, so the visual "this is what's
 *  selected" state tracks the user's finger in real time instead of only
 *  updating once scrolling fully stops. */
function WheelRow({
  label,
  index,
  scrollY,
  ink,
  outlineVariant,
}: {
  label: string;
  index: number;
  scrollY: SharedValue<number>;
  ink: string;
  outlineVariant: string;
}): React.JSX.Element {
  const animatedStyle = useAnimatedStyle(() => {
    const distance = Math.abs(index * ITEM_HEIGHT - scrollY.value) / ITEM_HEIGHT;
    const scale = interpolate(distance, [0, 1], [CENTER_SCALE, EDGE_SCALE], Extrapolation.CLAMP);
    const opacity = interpolate(distance, [0, 1], [1, EDGE_OPACITY], Extrapolation.CLAMP);
    const color = interpolateColor(distance, [0, 1], [ink, outlineVariant]);
    return { transform: [{ scale }], opacity, color };
  });

  return (
    <View style={styles.wheelItem}>
      <Animated.Text style={[styles.wheelItemText, animatedStyle]} allowFontScaling={false}>
        {label}
      </Animated.Text>
    </View>
  );
}

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

function WheelColumn({
  values,
  selected,
  onSettle,
  theme,
}: {
  values: number[];
  selected: number;
  onSettle: (value: number) => void;
  theme: AppPalette;
}): React.JSX.Element {
  const initialIndex = Math.max(0, values.indexOf(selected));
  const scrollRef = useRef<GHScrollView>(null);
  const scrollY = useSharedValue(initialIndex * ITEM_HEIGHT);
  // Tracks which index the last haptic tick fired for, on the UI thread —
  // a plain JS ref can't be read/written from inside a worklet.
  const lastTickIndex = useSharedValue(initialIndex);

  function commitIndex(index: number): void {
    const clamped = Math.min(Math.max(index, 0), values.length - 1);
    onSettle(values[clamped]!);
  }

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
      const nearest = Math.round(e.contentOffset.y / ITEM_HEIGHT);
      if (nearest !== lastTickIndex.value) {
        lastTickIndex.value = nearest;
        runOnJS(haptics.selection)();
      }
    },
  });

  function handleSettle(y: number): void {
    commitIndex(Math.round(y / ITEM_HEIGHT));
  }

  // A more robust guarantee of the correct initial scroll position than the
  // `contentOffset` prop alone — on some Android + gesture-handler
  // ScrollView combinations that prop's first-frame application is
  // unreliable, which is exactly the kind of "settles half a row off"
  // symptom that makes a wheel feel broken before the user even touches
  // it. Re-applied with `animated: false`, so it's an instant correction,
  // never a visible extra scroll motion.
  useEffect(() => {
    scrollRef.current?.scrollTo({ y: initialIndex * ITEM_HEIGHT, animated: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AnimatedScrollView
      ref={scrollRef}
      style={styles.wheelColumn}
      contentContainerStyle={{ paddingVertical: PADDING }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      snapToAlignment="start"
      decelerationRate="fast"
      contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
      scrollEventThrottle={16}
      onScroll={scrollHandler}
      onMomentumScrollEnd={(e) => handleSettle(e.nativeEvent.contentOffset.y)}
      onScrollEndDrag={(e) => {
        // Only a drag that ends without momentum settles here — one that
        // hands off to momentum is finished by onMomentumScrollEnd instead,
        // otherwise both fire for the same gesture and can briefly commit
        // two different indices in a row.
        if (!e.nativeEvent.velocity || (Math.abs(e.nativeEvent.velocity.y) < 0.01)) {
          handleSettle(e.nativeEvent.contentOffset.y);
        }
      }}
    >
      {values.map((v, index) => (
        <WheelRow
          key={v}
          label={pad2(v)}
          index={index}
          scrollY={scrollY}
          ink={theme.ink}
          outlineVariant={theme.outlineVariant}
        />
      ))}
    </AnimatedScrollView>
  );
}

/**
 * A native-feeling scroll-snap hour:minute wheel (Stitch reference: "Heure",
 * stitch/search_flow/search-time-selection.html) — replaces the time-chip
 * grid for this one flow. Two independent `ScrollView`s with
 * `snapToInterval`; each row's emphasis is a continuous, reanimated
 * transform driven by live scroll position (not a post-settle style swap),
 * and the centered item on settle becomes the selected value.
 * `DepartureTimeSheet` (day chips + time-chip grid combined) is untouched
 * and still backs driver/publish.tsx.
 */
export function TimeWheelSheet({
  visible,
  onClose,
  value,
  onChange,
  title = 'Heure',
  closeLabel = 'Fermer',
  subtitleLabel = 'À quelle heure souhaitez-vous partir ?',
  summaryLabel = (time) => `Rechercher vers ${time}`,
  confirmLabel = 'Confirmer',
}: TimeWheelSheetProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const [hour, setHour] = useState(value.getHours());
  const [minute, setMinute] = useState(() => {
    const rounded = Math.round(value.getMinutes() / MINUTE_STEP) * MINUTE_STEP;
    return rounded >= 60 ? 0 : rounded;
  });

  const now = useMemo(() => new Date(), []);

  // Re-syncs to the live `value` every time the sheet opens (same reason as
  // DateCalendarSheet's identical effect) — the wheel itself remounts fresh
  // on open (BottomSheet returns nothing while hidden, so its children
  // genuinely unmount/remount, not just re-render), so this lands before
  // the wheel's initial-scroll-position ever renders.
  useEffect(() => {
    if (!visible) return;
    setHour(value.getHours());
    const rounded = Math.round(value.getMinutes() / MINUTE_STEP) * MINUTE_STEP;
    setMinute(rounded >= 60 ? 0 : rounded);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function confirm(): void {
    const merged = new Date(value);
    merged.setHours(hour, minute, 0, 0);
    // A departure can't be in the past — if the merged moment already has
    // slipped behind "now" (only possible when `value`'s day is today),
    // round up to the nearest real slot instead of silently accepting it.
    const finalValue = isSameDay(merged, now) && merged.getTime() < now.getTime() ? roundUpToSlot(now, MINUTE_STEP) : merged;
    haptics.success();
    onChange(finalValue);
    onClose();
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightRatio={0.62}
      theme={theme}
      headerContent={
        <View style={styles.header}>
          <View style={styles.headerSpacer} />
          <Text variant="h3" color={theme.ink} style={styles.headerTitle}>
            {title}
          </Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={12}
            style={styles.closeBtn}
            accessibilityRole="button"
            accessibilityLabel={closeLabel}
          >
            <Icon name="close" size="sm" color={theme.ink} />
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.summary}>
        <Text variant="bodySmall" color={theme.inkMuted}>
          {subtitleLabel}
        </Text>
        <Text
          variant="h2"
          color={theme.ink}
          style={styles.summaryValue}
          accessibilityLiveRegion="polite"
        >
          {summaryLabel(`${pad2(hour)}:${pad2(minute)}`)}
        </Text>
      </View>

      <View style={styles.wheelWrap}>
        <View
          pointerEvents="none"
          style={[styles.highlightBox, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}
        />
        <WheelColumn values={HOURS} selected={hour} onSettle={setHour} theme={theme} />
        <View style={styles.separatorWrap}>
          <Text variant="h2" color={theme.ink} style={styles.separator}>
            :
          </Text>
        </View>
        <WheelColumn values={MINUTES} selected={minute} onSettle={setMinute} theme={theme} />

        {/* Top/bottom edge fades — the classic wheel-picker affordance that
            tells the eye "more values continue past here," and softens the
            otherwise-abrupt clip at the column's top/bottom edge. */}
        <LinearGradient
          pointerEvents="none"
          colors={[`${theme.surface}FF`, `${theme.surface}00`]}
          style={[styles.edgeFade, styles.edgeFadeTop]}
        />
        <LinearGradient
          pointerEvents="none"
          colors={[`${theme.surface}00`, `${theme.surface}FF`]}
          style={[styles.edgeFade, styles.edgeFadeBottom]}
        />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={confirm}
          style={[styles.confirmBtn, { backgroundColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel={confirmLabel}
        >
          <Text variant="label" color={theme.onInk}>
            {confirmLabel}
          </Text>
        </TouchableOpacity>
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    paddingHorizontal: spacing.lg,
  },
  headerSpacer: {
    width: 32,
  },
  headerTitle: {
    flex: 1,
    textAlign: 'center',
  },
  closeBtn: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  summary: {
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.md,
  },
  summaryValue: {
    textAlign: 'center',
  },
  wheelWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: WHEEL_HEIGHT,
    position: 'relative',
  },
  highlightBox: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    marginLeft: -HIGHLIGHT_WIDTH / 2,
    marginTop: -HIGHLIGHT_HEIGHT / 2,
    width: HIGHLIGHT_WIDTH,
    height: HIGHLIGHT_HEIGHT,
    borderRadius: radii['2xl'],
    borderWidth: 1,
  },
  wheelColumn: {
    width: COLUMN_WIDTH,
    height: WHEEL_HEIGHT,
  },
  wheelItem: {
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wheelItemText: {
    fontSize: ITEM_FONT_SIZE,
    lineHeight: ITEM_LINE_HEIGHT,
    height: ITEM_LINE_HEIGHT,
    textAlign: 'center',
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
    // Android pads a Text node's box beyond its glyphs' real ascent/descent
    // by default, which is the single most common cause of RN text looking
    // vertically off-center inside an exactly-sized container — this turns
    // that padding off so the fixed-height flex-centering above is centering
    // the glyphs themselves, not glyphs-plus-invisible-padding.
    ...(Platform.OS === 'android' ? { includeFontPadding: false, textAlignVertical: 'center' } : null),
  },
  separatorWrap: {
    width: SEPARATOR_WIDTH,
    height: ITEM_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  separator: {
    textAlign: 'center',
  },
  edgeFade: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: ITEM_HEIGHT * 1.5,
  },
  edgeFadeTop: {
    top: 0,
  },
  edgeFadeBottom: {
    bottom: 0,
  },
  footer: {
    marginTop: spacing['4xl'],
  },
  confirmBtn: {
    height: 52,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
