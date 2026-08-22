import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { BottomSheet } from './BottomSheet';
import { Chip } from './Chip';
import { Text } from './Text';
import { spacing } from '../tokens/index';
import { useAppTheme } from '../theme/AppThemeProvider';
import {
  buildDayOptions,
  buildTimeOptions,
  firstDayWithSlots,
  formatTime,
  isSameDay,
  type DayOption,
} from '../utils/scheduling';

export interface DepartureTimeSheetProps {
  visible: boolean;
  onClose: () => void;
  value: Date;
  onChange: (date: Date) => void;
  /** Earliest selectable moment — defaults to now. Pass a fixed instant
   *  rather than letting each render call `new Date()` if the caller needs
   *  the day/time grid to stay stable while the sheet is open. */
  minDate?: Date;
  title?: string;
  dayCount?: number;
}

/**
 * A frictionless day + time picker for a "when" field (ride departure,
 * search window) — a bottom sheet of day chips (Aujourd'hui/Demain/...)
 * over a grid of half-hour time chips, never a free-form date/time entry.
 * Tapping a day switches the time grid; tapping a time commits the value
 * and closes the sheet in one step. All date/time math lives in
 * `utils/scheduling.ts` so it's unit-testable without a renderer — this
 * component only wires that logic to Chip/BottomSheet.
 */
export function DepartureTimeSheet({
  visible,
  onClose,
  value,
  onChange,
  minDate,
  title = 'Quand ?',
  dayCount = 14,
}: DepartureTimeSheetProps): React.JSX.Element {
  const { colors: theme } = useAppTheme();
  // Captured once per mount/minDate-change rather than recomputed on every
  // render — keeps the day/time grid stable while the sheet stays open.
  const now = useMemo(() => minDate ?? new Date(), [minDate]);
  const days = useMemo(() => buildDayOptions(now, dayCount), [now, dayCount]);
  const defaultDay = useMemo(() => firstDayWithSlots(days, now), [days, now]);
  const initialDay = days.find((day) => isSameDay(day.date, value)) ?? defaultDay;
  const [selectedDay, setSelectedDay] = useState<DayOption>(initialDay);
  const times = useMemo(() => buildTimeOptions(selectedDay.date, now), [selectedDay, now]);

  function selectTime(time: Date): void {
    onChange(time);
    onClose();
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={title} heightRatio={0.72} theme={theme}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.dayRow}
      >
        {days.map((day) => {
          const selected = isSameDay(day.date, selectedDay.date);
          return (
            <Chip
              key={day.date.toISOString()}
              label={day.label}
              tone={selected ? 'default' : 'dim'}
              selected={selected}
              onPress={() => setSelectedDay(day)}
              style={styles.dayChip}
              theme={theme}
            />
          );
        })}
      </ScrollView>

      <Text variant="label" color={theme.inkMuted} style={styles.timeLabel}>
        HEURE
      </Text>

      {times.length === 0 ? (
        <Text variant="bodySmall" color={theme.inkFaint} style={styles.emptyNote}>
          Plus de créneaux disponibles pour ce jour — choisissez-en un autre.
        </Text>
      ) : (
        <ScrollView contentContainerStyle={styles.timeGrid}>
          {times.map((time) => {
            const selected = time.getTime() === value.getTime();
            return (
              <Chip
                key={time.toISOString()}
                label={formatTime(time)}
                tone={selected ? 'default' : 'dim'}
                selected={selected}
                onPress={() => selectTime(time)}
                style={styles.timeChip}
                theme={theme}
              />
            );
          })}
        </ScrollView>
      )}
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  dayRow: {
    gap: spacing.sm,
    paddingBottom: spacing.md,
  },
  dayChip: {
    paddingVertical: spacing.sm,
  },
  timeLabel: {
    fontWeight: '600',
    letterSpacing: 1,
    marginBottom: spacing.sm,
  },
  timeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  timeChip: {
    paddingVertical: spacing.sm,
    minWidth: 76,
    justifyContent: 'center',
  },
  emptyNote: {
    paddingVertical: spacing.lg,
  },
});
