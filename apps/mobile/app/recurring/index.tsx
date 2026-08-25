import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Icon,
  SkeletonBlock,
  Text,
  colors,
  spacing,
} from '@vaya/design-system';
import {
  useListMyRecurringPatternsQuery,
  useUpdateRecurringPatternMutation,
  type RecurringPattern,
} from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';
import { formatDaysOfWeek, formatTimeWindow } from '../../src/features/recurring/recurringHelpers';

/**
 * Pattern-management screen (docs/roadmap/phase-11-recurring-rides.md's
 * Screens section) — view/dismiss/disable. Reuses Card/Badge/EmptyState,
 * no new design-system primitive, mirroring notifications/index.tsx's
 * "small composition, no bespoke primitive" discipline for a minimal list
 * screen.
 */
export default function RecurringPatternsScreen(): React.JSX.Element {
  const { t } = useTranslation();
  const { data: patterns, isLoading } = useListMyRecurringPatternsQuery();
  const [updatePattern, { isLoading: isUpdating }] = useUpdateRecurringPatternMutation();

  async function handleDismiss(pattern: RecurringPattern): Promise<void> {
    try {
      await updatePattern({ patternId: pattern.id, input: { action: 'dismiss' } }).unwrap();
      trackEvent('recurring_pattern_dismissed', { patternId: pattern.id, role: pattern.role });
    } catch {
      // Best-effort UI action — the list simply won't reflect the change;
      // no destructive/irreversible consequence if it silently fails.
    }
  }

  async function handleEnable(pattern: RecurringPattern): Promise<void> {
    try {
      await updatePattern({ patternId: pattern.id, input: { action: 'enable' } }).unwrap();
      trackEvent('recurring_pattern_enabled', { patternId: pattern.id, role: pattern.role });
    } catch {
      // Same best-effort posture as handleDismiss above.
    }
  }

  if (isLoading) {
    return (
      <View style={styles.container}>
        <View style={styles.list}>
          {[0, 1].map((i) => (
            <SkeletonBlock key={i} height={96} radius="xl" />
          ))}
        </View>
      </View>
    );
  }

  const visible = (patterns ?? []).filter((p) => p.status !== 'dismissed');

  if (visible.length === 0) {
    return (
      <View style={styles.container}>
        <EmptyState
          icon={<Icon name="repeat-outline" size="lg" color={colors.gray400} />}
          title={t('booking:recurring.emptyTitle')}
          description={t('booking:recurring.emptyDescription')}
        />
      </View>
    );
  }

  const STATUS_BADGE: Record<string, { variant: 'success' | 'default' }> = {
    enabled: { variant: 'success' },
    suggested: { variant: 'default' },
    detected: { variant: 'default' },
    dismissed: { variant: 'default' },
  };

  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {visible.map((pattern) => {
          const badge = STATUS_BADGE[pattern.status] ?? { variant: 'default' as const };
          return (
            <Card key={pattern.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text variant="label">{pattern.originLabel}</Text>
                <Badge label={t(`common:status.${pattern.status}`)} variant={badge.variant} />
              </View>
              <Text variant="bodySmall" color={colors.gray600}>
                → {pattern.destinationLabel}
              </Text>
              <Text variant="bodySmall" color={colors.gray600}>
                {formatDaysOfWeek(pattern.daysOfWeekMask, t)} ·{' '}
                {formatTimeWindow(pattern.timeWindowStart, pattern.timeWindowEnd)} ·{' '}
                {pattern.role === 'driver' ? t('booking:driver') : t('booking:passenger')}
              </Text>

              {pattern.status === 'enabled' && pattern.role === 'driver' && pattern.matchesToday ? (
                <Button
                  label={pattern.todayRideId ? t('booking:recurring.viewTodayRide') : t('booking:recurring.confirmTodayRide')}
                  size="md"
                  style={styles.actionBtn}
                  onPress={() =>
                    router.push(
                      pattern.todayRideId
                        ? '/(tabs)/trips'
                        : { pathname: '/recurring/confirm-draft', params: { patternId: pattern.id } },
                    )
                  }
                />
              ) : null}

              <View style={styles.actions}>
                {pattern.status !== 'enabled' ? (
                  <Button
                    label={t('common:actions.enable')}
                    variant="outline"
                    size="sm"
                    loading={isUpdating}
                    onPress={() => void handleEnable(pattern)}
                  />
                ) : null}
                <Button
                  label={pattern.status === 'enabled' ? t('common:actions.disable') : t('common:actions.dismiss')}
                  variant="ghost"
                  size="sm"
                  loading={isUpdating}
                  onPress={() => void handleDismiss(pattern)}
                />
              </View>
            </Card>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.gray100,
  },
  list: {
    padding: spacing.lg,
    gap: spacing.md,
  },
  card: {
    gap: spacing.xs,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  actionBtn: {
    marginTop: spacing.sm,
  },
});
