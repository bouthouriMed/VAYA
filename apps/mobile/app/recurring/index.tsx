import { ScrollView, StyleSheet, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import {
  Badge,
  Button,
  Card,
  ScreenHeader,
  StateView,
  Text,
  useAppTheme,
  useToast,
  spacing,
} from '@vaya/design-system';
import {
  useListMyRecurringPatternsQuery,
  useUpdateRecurringPatternMutation,
  type RecurringPattern,
} from '../../src/state/api';
import { trackEvent } from '../../src/services/analytics/analytics';
import { formatDaysOfWeek, formatTimeWindow } from '../../src/features/recurring/recurringHelpers';

const STATUS_TONE: Record<RecurringPattern['status'], 'success' | 'default'> = {
  enabled: 'success',
  suggested: 'default',
  detected: 'default',
  dismissed: 'default',
};

/**
 * Pattern-management screen (docs/roadmap/phase-11-recurring-rides.md's
 * Screens section) — view/enable/dismiss/disable detected recurring rides.
 */
export default function RecurringPatternsScreen(): React.JSX.Element {
  const { t } = useTranslation(['booking', 'common']);
  const insets = useSafeAreaInsets();
  const { colors: theme } = useAppTheme();
  const showToast = useToast();
  const { data: patterns, isLoading, isError, refetch } = useListMyRecurringPatternsQuery();
  const [updatePattern, { isLoading: isUpdating }] = useUpdateRecurringPatternMutation();

  async function update(pattern: RecurringPattern, action: 'enable' | 'dismiss'): Promise<void> {
    try {
      await updatePattern({ patternId: pattern.id, input: { action } }).unwrap();
      trackEvent(action === 'enable' ? 'recurring_pattern_enabled' : 'recurring_pattern_dismissed', {
        patternId: pattern.id,
        role: pattern.role,
      });
    } catch {
      showToast({ message: t('booking:recurring.updateError'), tone: 'error' });
    }
  }

  const header = (
    <ScreenHeader
      topInset={insets.top}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/(tabs)/profile'))}
      backLabel={t('common:actions.back')}
      title={t('booking:recurring.title')}
    />
  );

  const visible = (patterns ?? []).filter((p) => p.status !== 'dismissed');

  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {header}
      {isLoading ? (
        <StateView status="loading" skeleton="list" />
      ) : isError ? (
        <StateView
          status="error"
          title={t('booking:recurring.loadError')}
          description={t('trips:loadError.description')}
          actionLabel={t('common:actions.retry')}
          onAction={() => void refetch()}
        />
      ) : visible.length === 0 ? (
        <StateView
          status="empty"
          iconName="repeat-outline"
          title={t('booking:recurring.empty')}
          description={t('booking:recurring.emptyDescription')}
        />
      ) : (
        <ScrollView contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + spacing.xl }]}>
          {visible.map((pattern) => (
            <Card key={pattern.id} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text variant="label" color={theme.ink} style={styles.route} numberOfLines={2}>
                  {`${pattern.originLabel} → ${pattern.destinationLabel}`}
                </Text>
                <Badge label={t(`booking:recurring.${pattern.status}`)} variant={STATUS_TONE[pattern.status]} />
              </View>
              <Text variant="bodySmall" color={theme.inkMuted}>
                {`${formatDaysOfWeek(pattern.daysOfWeekMask, t)} · ${formatTimeWindow(pattern.timeWindowStart, pattern.timeWindowEnd)} · ${
                  pattern.role === 'driver' ? t('booking:driver') : t('booking:passenger')
                }`}
              </Text>

              {pattern.status === 'enabled' && pattern.role === 'driver' && pattern.matchesToday ? (
                <Button
                  label={pattern.todayRideId ? t('booking:recurring.viewTodayRide') : t('booking:recurring.confirmTodayRide')}
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
                    onPress={() => void update(pattern, 'enable')}
                  />
                ) : null}
                <Button
                  label={pattern.status === 'enabled' ? t('common:actions.disable') : t('common:actions.dismiss')}
                  variant="ghost"
                  size="sm"
                  loading={isUpdating}
                  onPress={() => void update(pattern, 'dismiss')}
                />
              </View>
            </Card>
          ))}
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  route: {
    flex: 1,
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
