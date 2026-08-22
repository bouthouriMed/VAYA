import { View, StyleSheet } from 'react-native';
import { BottomSheet, Button, Text, useAppTheme, spacing, radii } from '@vaya/design-system';
import type { RecurringPattern } from '../../state/api';
import { buildDetectionPromptCopy, formatDaysOfWeek, formatTimeWindow } from './recurringHelpers';

interface RecurringPatternPromptSheetProps {
  visible: boolean;
  pattern: RecurringPattern | null;
  onClose: () => void;
  onEnable: () => void;
  enabling: boolean;
}

/**
 * The Phase 11 detection-prompt bottom sheet
 * (docs/roadmap/phase-11-recurring-rides.md's Screens section: "not a new
 * top-level screen for the prompt itself" — reuses BottomSheet, Phase 2's
 * primitive, exactly like RatingPromptSheet does). Mounted via
 * RecurringPatternPromptBridge at the app root; the "suggested" -> user
 * acts -> "enabled" transition happens through `onEnable` here.
 */
export function RecurringPatternPromptSheet({
  visible,
  pattern,
  onClose,
  onEnable,
  enabling,
}: RecurringPatternPromptSheetProps): React.JSX.Element | null {
  const theme = useAppTheme().colors;
  if (!pattern) return null;
  const copy = buildDetectionPromptCopy(pattern);

  return (
    <BottomSheet visible={visible} onClose={onClose} title={copy.title} heightRatio={0.4} theme={theme}>
      <View style={styles.content}>
        <Text variant="body" color={theme.ink}>{copy.body}</Text>

        <View style={[styles.routeCard, { backgroundColor: theme.surfaceMuted }]}>
          <Text variant="label" color={theme.ink}>{pattern.originLabel}</Text>
          <Text variant="bodySmall" color={theme.inkMuted}>
            → {pattern.destinationLabel}
          </Text>
          <Text variant="bodySmall" color={theme.inkMuted}>
            {formatDaysOfWeek(pattern.daysOfWeekMask)} · {formatTimeWindow(pattern.timeWindowStart, pattern.timeWindowEnd)}
          </Text>
        </View>

        <Button
          label="En faire un trajet régulier"
          size="lg"
          loading={enabling}
          onPress={onEnable}
          style={styles.cta}
          theme={theme}
        />
        <Button
          label="Pas maintenant"
          variant="ghost"
          size="lg"
          onPress={onClose}
          style={styles.cta}
          theme={theme}
        />
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
    paddingBottom: spacing.xl,
  },
  routeCard: {
    gap: spacing.xs,
    padding: spacing.md,
    borderRadius: radii.xl,
  },
  cta: {
    width: '100%',
  },
});
