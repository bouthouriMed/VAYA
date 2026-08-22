import React, { useEffect, useMemo, useState } from 'react';
import { View, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { BottomSheet } from './BottomSheet';
import { Text } from './Text';
import { Icon } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import { buildMonthGrid, formatMonthName, formatYearLabel, isSameDay, startOfDay } from '../utils/scheduling';

export interface DateCalendarSheetProps {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onChange: (date: Date) => void;
  title?: string;
}

const CELL_SIZE = 40;
const SWIPE_THRESHOLD = 40;

/**
 * A real month calendar grid (Stitch reference: "Date de départ",
 * stitch/search_flow/calendar-selection-b.html) — prev/next month
 * navigation, past days disabled, today subtly marked, the selected day
 * solid-filled. Replaces the horizontal day-chip row for this one flow;
 * `DepartureTimeSheet` (day chips + time-chip grid combined) is untouched
 * and still backs driver/publish.tsx.
 */
export function DateCalendarSheet({
  visible,
  onClose,
  value,
  onChange,
  title = 'Date de départ',
}: DateCalendarSheetProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  const now = useMemo(() => new Date(), []);
  const [monthAnchor, setMonthAnchor] = useState(
    () => new Date(value.getFullYear(), value.getMonth(), 1),
  );
  const [selected, setSelected] = useState(() => startOfDay(value));

  const grid = useMemo(() => buildMonthGrid(monthAnchor, now), [monthAnchor, now]);
  const isCurrentMonth =
    monthAnchor.getFullYear() === now.getFullYear() && monthAnchor.getMonth() === now.getMonth();

  // Re-syncs to the live `value` every time the sheet opens — `selected`/
  // `monthAnchor`'s useState initializers only run once, at this
  // component's first mount (explore.tsx always renders it, just hidden),
  // so without this a value picked up before `value` had settled would
  // stick around silently, with no real cell ever showing as selected.
  useEffect(() => {
    if (!visible) return;
    setMonthAnchor(new Date(value.getFullYear(), value.getMonth(), 1));
    setSelected(startOfDay(value));
    // Only re-sync on the open transition — not on every `value` tick —
    // so an in-progress selection isn't clobbered while the sheet is open.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  function goToMonth(offset: number): void {
    setMonthAnchor((prev) => {
      const next = new Date(prev.getFullYear(), prev.getMonth() + offset, 1);
      const floor = new Date(now.getFullYear(), now.getMonth(), 1);
      return next.getTime() < floor.getTime() ? floor : next;
    });
  }

  // Live-follows the finger during the drag (not just react-on-release) so
  // the swipe actually feels like dragging the grid, not a hidden gesture
  // that silently flips the month afterward. Built on the same
  // GestureDetector + reanimated stack as BottomSheet's own drag, for the
  // same reason (see BottomSheet.tsx's comment) — plain PanResponder's
  // touch-responder negotiation is unreliable around this much
  // TouchableOpacity content.
  const gridTranslateX = useSharedValue(0);

  // MUST be a 'worklet' and reach goToMonth via runOnJS: settleGrid runs on
  // the UI thread (called from the auto-workletized monthSwipeGesture.onEnd),
  // and calling a non-worklet function — let alone React's setState inside
  // goToMonth — directly from there throws on the UI thread, where there is
  // no redbox: on iOS/Fabric it kills the process outright, silently bouncing
  // the whole app to the home screen. That was exactly the "swiping right in
  // the calendar dismisses the entire app" crash.
  function settleGrid(nextMonthOffset?: 1 | -1): void {
    'worklet';
    gridTranslateX.value = withTiming(0, { duration: 150 });
    if (nextMonthOffset) runOnJS(goToMonth)(nextMonthOffset);
  }

  // Horizontal-only, and yields early to BottomSheet's own vertical drag
  // gesture via failOffsetY — the mirror image of BottomSheet's
  // failOffsetX, so a mostly-vertical touch here is refused and handed up
  // to the sheet's dismiss gesture instead of getting stuck.
  const monthSwipeGesture = Gesture.Pan()
    .activeOffsetX([-10, 10])
    .failOffsetY([-15, 15])
    .onUpdate((e) => {
      gridTranslateX.value = e.translationX;
    })
    .onEnd((e, success) => {
      // Same reasoning as BottomSheet's dragGesture.onEnd: a gesture that
      // FAILED (e.g. a mostly-vertical touch refused via failOffsetY, meant
      // for the sheet's own dismiss drag) still invokes onEnd here, and its
      // leftover translationX could spuriously cross SWIPE_THRESHOLD.
      if (!success) return;
      // goToMonth() itself clamps at the current month, so swiping right
      // past it is a harmless no-op rather than something to guard here.
      if (e.translationX <= -SWIPE_THRESHOLD) settleGrid(1);
      else if (e.translationX >= SWIPE_THRESHOLD) settleGrid(-1);
      else settleGrid();
    });

  const gridAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: gridTranslateX.value }],
  }));

  function confirm(): void {
    // Preserves the existing time-of-day, only the calendar day changes —
    // matches Heure being a separate, independent field.
    const merged = new Date(selected);
    merged.setHours(value.getHours(), value.getMinutes(), 0, 0);
    onChange(merged);
    onClose();
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightRatio={0.6}
      theme={theme}
      contentGesture={monthSwipeGesture}
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
            accessibilityLabel="Fermer"
          >
            <Icon name="close" size="sm" color={theme.ink} />
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.monthHeader}>
        {/* Outer cells share the calendar's 100/7% column width, so each
         *  arrow centers exactly over the first/last weekday column below. */}
        <View style={styles.navCell}>
          <TouchableOpacity
            onPress={() => goToMonth(-1)}
            disabled={isCurrentMonth}
            style={[
              styles.navBtn,
              { borderColor: theme.outlineVariant },
              isCurrentMonth && styles.navBtnDisabled,
            ]}
            accessibilityRole="button"
            accessibilityLabel="Mois précédent"
          >
            <Icon
              name="chevron-back"
              size="sm"
              color={isCurrentMonth ? theme.outlineVariant : theme.inkMuted}
            />
          </TouchableOpacity>
        </View>
        <View style={styles.monthTitleWrap}>
          <Text variant="h3" color={theme.ink}>
            {formatMonthName(monthAnchor)}
          </Text>
          <Text variant="caption" color={theme.inkFaint}>
            {formatYearLabel(monthAnchor)}
          </Text>
        </View>
        <View style={styles.navCell}>
          <TouchableOpacity
            onPress={() => goToMonth(1)}
            style={[styles.navBtn, { borderColor: theme.outlineVariant }]}
            accessibilityRole="button"
            accessibilityLabel="Mois suivant"
          >
            <Icon name="chevron-forward" size="sm" color={theme.ink} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.weekdayRow}>
        {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((label, i) => (
          <Text
            key={`${label}-${i}`}
            variant="caption"
            color={theme.inkFaint}
            style={[styles.weekdayCell, i >= 5 && styles.weekendLabel]}
          >
            {label}
          </Text>
        ))}
      </View>

      <GestureDetector gesture={monthSwipeGesture}>
        <Animated.View style={[styles.grid, gridAnimatedStyle]}>
          {grid.map((cell) => {
            if (!cell.isCurrentMonth) {
              return <View key={cell.date.toISOString()} style={styles.cell} />;
            }
            const isSelected = isSameDay(cell.date, selected);
            return (
              <TouchableOpacity
                key={cell.date.toISOString()}
                disabled={cell.isPast}
                onPress={() => setSelected(startOfDay(cell.date))}
                style={[
                  styles.cell,
                  isSelected
                    ? { backgroundColor: theme.ink }
                    : cell.isToday
                      ? {
                          backgroundColor: theme.outlineVariant,
                          borderWidth: 2,
                          borderColor: theme.outlineVariant,
                        }
                      : null,
                ]}
                accessibilityRole="button"
                accessibilityLabel={cell.date.toLocaleDateString('fr-FR', {
                  day: 'numeric',
                  month: 'long',
                })}
                accessibilityState={{ selected: isSelected, disabled: cell.isPast }}
              >
                <Text
                  variant="body"
                  color={isSelected ? theme.onInk : cell.isPast ? theme.outlineVariant : theme.ink}
                  style={(isSelected || cell.isToday) && styles.cellTextBold}
                >
                  {cell.date.getDate()}
                </Text>
                {cell.isToday && !isSelected ? (
                  <View style={[styles.todayDot, { backgroundColor: theme.ink }]} />
                ) : null}
              </TouchableOpacity>
            );
          })}
        </Animated.View>
      </GestureDetector>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={confirm}
          style={[styles.confirmBtn, { backgroundColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel="Confirmer la date"
        >
          <Text variant="label" color={theme.onInk}>
            Confirmer la date
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
    paddingBottom: spacing.md
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
  monthHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: spacing.sm,
  },
  navCell: {
    width: `${100 / 7}%`,
    alignItems: 'center',
  },
  monthTitleWrap: {
    flex: 1,
    alignItems: 'center',
    gap: 2,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  navBtnDisabled: {
    opacity: 0.5,
  },
  weekdayRow: {
    flexDirection: 'row',
  },
  weekdayCell: {
    flexBasis: `${100 / 7}%`,
    textAlign: 'center',
  },
  weekendLabel: {
    opacity: 0.5,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: spacing.xs,
  },
  cell: {
    width: `${100 / 7}%`,
    height: CELL_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellTextBold: {
    fontWeight: '600',
  },
  todayDot: {
    position: 'absolute',
    bottom: 6,
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  footer: {
    marginTop: spacing['4xl'],
  },
  confirmBtn: {
    height: 48,
    borderRadius: radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
