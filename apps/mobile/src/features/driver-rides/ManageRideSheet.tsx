import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { BottomSheet, Badge, Text, Icon, useAppTheme, spacing, radii, haptics } from '@vaya/design-system';
import { useTranslation } from 'react-i18next';
import type { Ride } from '../../state/api';
import { useCancelRideMutation } from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';

interface ManageRideSheetProps {
  visible: boolean;
  ride: Ride | null;
  onClose: () => void;
}

/**
 * The dashboard hero card's "Gérer" action (stitch my-rides-driver-dashboard):
 * the ride's real facts plus the one destructive action that exists today —
 * cancelling the ride. Cancellation is deliberately two-step INSIDE this
 * sheet (announce → confirm), replacing the previous single-tap inline
 * cancel which could fire from an accidental touch.
 */
export function ManageRideSheet({ visible, ride, onClose }: ManageRideSheetProps): React.JSX.Element {
  const { t } = useTranslation();
  const theme = useAppTheme().colors;
  const [confirmingCancel, setConfirmingCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cancelRide, { isLoading: cancelling }] = useCancelRideMutation();

  useEffect(() => {
    if (!visible) {
      setConfirmingCancel(false);
      setError(null);
    }
  }, [visible]);

  if (!ride) return <BottomSheet visible={false} onClose={onClose} theme={theme}>{null}</BottomSheet>;

  async function handleCancel(): Promise<void> {
    if (!ride) return;
    setError(null);
    try {
      await cancelRide(ride.id).unwrap();
      haptics.success();
      trackEvent('ride_cancelled', { screen: 'trips-dashboard', status: ride.status });
      onClose();
    } catch {
      haptics.error();
      setError(t('driver:rides.manageSheet.cancelError'));
    }
  }

  function formatWhen(iso: string): string {
    const date = new Date(iso);
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return `${t('common:time.today')}, ${time}`;
    return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
  }

  return (
    <BottomSheet visible={visible} onClose={onClose} title={t('driver:rides.manageSheet.title')} heightRatio={0.55} theme={theme}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text variant="body" color={theme.ink} style={styles.title}>
            {`${ride.originLabel} → ${ride.destinationLabel}`}
          </Text>
          <Badge label={t(`common:status.${ride.status}`)} variant={ride.status === 'published' ? 'success' : ride.status === 'cancelled' ? 'error' : ride.status === 'full' || ride.status === 'completed' ? 'info' : ride.status === 'in_progress' ? 'warning' : 'default'} />
        </View>

        <View style={[styles.factsCard, { backgroundColor: theme.surfaceMuted }]}>
          <View style={styles.factRow}>
            <Icon name="time-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {`${t('booking:departure')} · ${formatWhen(ride.departureAt)}`}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="people-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {t('driver:rides.manageSheet.seatsAvailable', { available: ride.seatsAvailable, total: ride.seatsTotal })}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="cash-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {t('driver:rides.manageSheet.pricePerSeat', { price: ride.contributionPerSeat })}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setConfirmingCancel(true)}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel={t('driver:rides.manageSheet.cancelCta')}
        >
          <Text variant="body" color={theme.error} style={styles.cancelLabel}>
            {t('driver:rides.manageSheet.cancelCta')}
          </Text>
        </TouchableOpacity>

        {confirmingCancel ? (
          <View style={[styles.confirmCard, { backgroundColor: theme.errorMuted }]}>
            <Text variant="bodySmall" color={theme.ink}>
              {t('driver:rides.manageSheet.cancelWarning')}
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                onPress={() => setConfirmingCancel(false)}
                disabled={cancelling}
                accessibilityRole="button"
                accessibilityLabel={t('driver:rides.manageSheet.keepCta')}
              >
                <Text variant="bodySmall" color={theme.ink} style={styles.confirmKeep}>
                  {t('driver:rides.manageSheet.keepCta')}
                </Text>
              </TouchableOpacity>
              {cancelling ? (
                <ActivityIndicator size="small" color={theme.error} />
              ) : (
                <TouchableOpacity
                  onPress={() => void handleCancel()}
                  accessibilityRole="button"
                  accessibilityLabel={t('driver:rides.manageSheet.confirmCancelCta')}
                >
                  <Text variant="bodySmall" color={theme.error} style={styles.confirmCancel}>
                    {t('driver:rides.manageSheet.confirmCancelCta')}
                  </Text>
                </TouchableOpacity>
              )}
            </View>
            {error ? (
              <Text variant="caption" color={theme.error} style={styles.errorText}>
                {error}
              </Text>
            ) : null}
          </View>
        ) : null}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
    gap: spacing.md,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  title: {
    fontWeight: '600',
    flexShrink: 1,
  },
  factsCard: {
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  factRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  cancelLabel: {
    textAlign: 'center',
    paddingVertical: spacing.sm,
    fontWeight: '600',
  },
  confirmCard: {
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.md,
  },
  confirmActions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: spacing.lg,
  },
  confirmKeep: {
    fontWeight: '600',
  },
  confirmCancel: {
    fontWeight: '700',
  },
  errorText: {
    textAlign: 'center',
  },
});
