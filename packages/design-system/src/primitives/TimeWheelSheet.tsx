import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  TouchableOpacity,
  StyleSheet,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
// gesture-handler's ScrollView (not RN core's) — it wraps a
// NativeViewGestureHandler that properly participates in the same gesture
// arena as BottomSheet's outer Gesture.Pan() drag-to-dismiss. A plain RN
// ScrollView nested under that Pan doesn't negotiate with it at all, so
// vertical wheel-scroll touches would get raced/stolen by the sheet's own
// drag gesture instead of scrolling the wheel.
import { ScrollView } from 'react-native-gesture-handler';
import { BottomSheet } from './BottomSheet';
import { Text } from './Text';
import { Icon } from './Icon';
import { spacing, radii } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import { roundUpToSlot, isSameDay } from '../utils/scheduling';
import type { AppPalette } from '../theme/palette';

export interface TimeWheelSheetProps {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onChange: (date: Date) => void;
  title?: string;
}

const ITEM_HEIGHT = 50;
const VISIBLE_COUNT = 3;
const WHEEL_HEIGHT = ITEM_HEIGHT * VISIBLE_COUNT;
const PADDING = ITEM_HEIGHT * Math.floor(VISIBLE_COUNT / 2);
const MINUTE_STEP = 5;
const COLUMN_WIDTH = 80;
const SEPARATOR_WIDTH = 20;
// The highlight box hugs the actual hour/separator/minute row width — it
// was previously a hardcoded 240px against ~180px of real content, so it
// visually floated free of the numbers instead of framing them.
const HIGHLIGHT_WIDTH = COLUMN_WIDTH * 3.5 + SEPARATOR_WIDTH;

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / MINUTE_STEP }, (_, i) => i * MINUTE_STEP);

function pad2(n: number): string {
  return n.toString().padStart(2, '0');
}

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

  function handleSettle(e: NativeSyntheticEvent<NativeScrollEvent>): void {
    const index = Math.round(e.nativeEvent.contentOffset.y / ITEM_HEIGHT);
    const clamped = Math.min(Math.max(index, 0), values.length - 1);
    onSettle(values[clamped]!);
  }

  return (
    <ScrollView
      style={styles.wheelColumn}
      contentContainerStyle={{ paddingVertical: PADDING }}
      showsVerticalScrollIndicator={false}
      snapToInterval={ITEM_HEIGHT}
      decelerationRate="fast"
      contentOffset={{ x: 0, y: initialIndex * ITEM_HEIGHT }}
      onMomentumScrollEnd={handleSettle}
      onScrollEndDrag={handleSettle}
    >
      {values.map((v) => {
        const isSelected = v === selected;
        return (
          <View key={v} style={styles.wheelItem}>
            <Text
              variant="body"
              color={isSelected ? theme.ink : theme.outlineVariant}
              style={isSelected ? styles.wheelItemSelected : styles.wheelItemText}
            >
              {pad2(v)}
            </Text>
          </View>
        );
      })}
    </ScrollView>
  );
}

/**
 * A native-feeling scroll-snap hour:minute wheel (Stitch reference: "Heure",
 * stitch/search_flow/search-time-selection.html) — replaces the time-chip
 * grid for this one flow. Two independent `ScrollView`s with
 * `snapToInterval`; the centered item on settle becomes the selected value,
 * no extra gesture library needed. `DepartureTimeSheet` (day chips +
 * time-chip grid combined) is untouched and still backs driver/publish.tsx.
 */
export function TimeWheelSheet({
  visible,
  onClose,
  value,
  onChange,
  title = 'Heure',
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
    onChange(finalValue);
    onClose();
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      heightRatio={0.6}
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
            accessibilityLabel="Fermer"
          >
            <Icon name="close" size="sm" color={theme.ink} />
          </TouchableOpacity>
        </View>
      }
    >
      <View style={styles.summary}>
        <Text variant="bodySmall" color={theme.inkMuted}>
          À quelle heure souhaitez-vous partir ?
        </Text>
        <Text variant="h2" color={theme.ink} style={styles.summaryValue}>
          Rechercher vers {pad2(hour)}:{pad2(minute)}
        </Text>
      </View>

      <View style={styles.wheelWrap}>
        <View
          pointerEvents="none"
          style={[styles.highlightBox, { backgroundColor: theme.surfaceMuted, borderColor: theme.outlineVariant }]}
        />
        <WheelColumn values={HOURS} selected={hour} onSettle={setHour} theme={theme} />
        <Text variant="h2" color={theme.ink} style={styles.separator}>
          :
        </Text>
        <WheelColumn values={MINUTES} selected={minute} onSettle={setMinute} theme={theme} />
      </View>

      <View style={styles.footer}>
        <TouchableOpacity
          onPress={confirm}
          style={[styles.confirmBtn, { backgroundColor: theme.ink }]}
          accessibilityRole="button"
          accessibilityLabel="Confirmer l'heure"
        >
          <Text variant="label" color={theme.onInk}>
            Confirmer
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
    marginTop: -ITEM_HEIGHT / 2,
    width: HIGHLIGHT_WIDTH,
    height: ITEM_HEIGHT,
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
  // A smaller size delta than a raw variant swap (20 -> 24, not 16 -> 24)
  // — enough to read as "selected" without the row visibly jumping/
  // misaligning against the highlight box as items scroll through center.
  wheelItemText: {
    fontSize: 20,
    lineHeight: 24,
    textAlign: 'center',
  },
  wheelItemSelected: {
    fontSize: 24,
    lineHeight: 29,
    fontWeight: '700',
    textAlign: 'center',
  },
  separator: {
    width: SEPARATOR_WIDTH,
    textAlign: 'center',
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
