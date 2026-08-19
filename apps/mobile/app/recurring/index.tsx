import { StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
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
  type RecurringPatternStatus,
} from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';
import { formatDaysOfWeek, formatTimeWindow } from '../../src/features/recurring/recurringHelpers';

const STATUS_BADGE: Record<RecurringPatternStatus, { label: string; variant: 'success' | 'default' }> = {
  enabled: { label: 'Actif', variant: 'success' },
  suggested: { label: 'Suggéré', variant: 'default' },
  detected: { label: 'Détecté', variant: 'default' },
  dismissed: { label: 'Ignoré', variant: 'default' },
};

/**
 * Pattern-management screen (docs/roadmap/phase-11-recurring-rides.md's
 * Screens section) — view/dismiss/disable. Reuses Card/Badge/EmptyState,
 * no new design-system primitive, mirroring notifications/index.tsx's
 * "small composition, no bespoke primitive" discipline for a minimal list
 * screen.
 */
export default function RecurringPatternsScreen(): React.JSX.Element {
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
          title="Aucun trajet régulier"
          description="Quand vous prenez ou publiez le même trajet plusieurs fois, VAYA vous propose d'en faire un trajet régulier."
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.list}>
        {visible.map((pattern) => {
          const badge = STATUS_BADGE[pattern.status];
          return (
            <Card key={pattern.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text variant="label">{pattern.originLabel}</Text>
                <Badge label={badge.label} variant={badge.variant} />
              </View>
              <Text variant="bodySmall" color={colors.gray600}>
                → {pattern.destinationLabel}
              </Text>
              <Text variant="bodySmall" color={colors.gray600}>
                {formatDaysOfWeek(pattern.daysOfWeekMask)} ·{' '}
                {formatTimeWindow(pattern.timeWindowStart, pattern.timeWindowEnd)} ·{' '}
                {pattern.role === 'driver' ? 'Conducteur' : 'Passager'}
              </Text>

              {pattern.status === 'enabled' && pattern.role === 'driver' && pattern.matchesToday ? (
                <Button
                  label={pattern.todayRideId ? "Aujourd'hui : voir le trajet" : "Confirmer le trajet d'aujourd'hui"}
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
                    label="Activer"
                    variant="outline"
                    size="sm"
                    loading={isUpdating}
                    onPress={() => void handleEnable(pattern)}
                  />
                ) : null}
                <Button
                  label={pattern.status === 'enabled' ? 'Désactiver' : 'Ignorer'}
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
