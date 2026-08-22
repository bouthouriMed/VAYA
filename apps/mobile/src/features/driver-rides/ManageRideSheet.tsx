import { useEffect, useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { BottomSheet, Badge, Text, Icon, useAppTheme, spacing, radii, haptics } from '@vaya/design-system';
import type { Ride } from '../../state/api';
import { useCancelRideMutation } from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';

interface ManageRideSheetProps {
  visible: boolean;
  ride: Ride | null;
  onClose: () => void;
}

const RIDE_BADGE: Record<Ride['status'], { label: string; variant: 'default' | 'success' | 'info' | 'warning' | 'error' }> = {
  draft: { label: 'Brouillon', variant: 'default' },
  published: { label: 'Publié', variant: 'success' },
  full: { label: 'Complet', variant: 'info' },
  in_progress: { label: 'En cours', variant: 'warning' },
  completed: { label: 'Terminé', variant: 'info' },
  cancelled: { label: 'Annulé', variant: 'error' },
};

/**
 * The dashboard hero card's "Gérer" action (stitch my-rides-driver-dashboard):
 * the ride's real facts plus the one destructive action that exists today —
 * cancelling the ride. Cancellation is deliberately two-step INSIDE this
 * sheet (announce → confirm), replacing the previous single-tap inline
 * cancel which could fire from an accidental touch.
 */
export function ManageRideSheet({ visible, ride, onClose }: ManageRideSheetProps): React.JSX.Element {
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
      setError("Impossible d'annuler ce trajet pour le moment. Réessayez.");
    }
  }

  function formatWhen(iso: string): string {
    const date = new Date(iso);
    const time = date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    if (date.toDateString() === new Date().toDateString()) return `Aujourd'hui, ${time}`;
    return `${date.toLocaleDateString('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' })} · ${time}`;
  }

  const badge = RIDE_BADGE[ride.status];

  return (
    <BottomSheet visible={visible} onClose={onClose} title="Gérer ce trajet" heightRatio={0.55} theme={theme}>
      <View style={styles.content}>
        <View style={styles.headerRow}>
          <Text variant="body" color={theme.ink} style={styles.title}>
            {`${ride.originLabel} → ${ride.destinationLabel}`}
          </Text>
          <Badge label={badge.label} variant={badge.variant} />
        </View>

        <View style={[styles.factsCard, { backgroundColor: theme.surfaceMuted }]}>
          <View style={styles.factRow}>
            <Icon name="time-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {`Départ · ${formatWhen(ride.departureAt)}`}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="people-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {`${ride.seatsAvailable}/${ride.seatsTotal} places disponibles`}
            </Text>
          </View>
          <View style={styles.factRow}>
            <Icon name="cash-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.inkMuted}>
              {`${ride.contributionPerSeat} DT par place`}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => setConfirmingCancel(true)}
          disabled={cancelling}
          accessibilityRole="button"
          accessibilityLabel="Annuler ce trajet"
        >
          <Text variant="body" color={theme.error} style={styles.cancelLabel}>
            Annuler ce trajet
          </Text>
        </TouchableOpacity>

        {confirmingCancel ? (
          <View style={[styles.confirmCard, { backgroundColor: theme.errorMuted }]}>
            <Text variant="bodySmall" color={theme.ink}>
              Les passagers déjà acceptés seront informés et les places seront libérées. Cette action est définitive.
            </Text>
            <View style={styles.confirmActions}>
              <TouchableOpacity
                onPress={() => setConfirmingCancel(false)}
                disabled={cancelling}
                accessibilityRole="button"
                accessibilityLabel="Ne pas annuler"
              >
                <Text variant="bodySmall" color={theme.ink} style={styles.confirmKeep}>
                  Garder le trajet
                </Text>
              </TouchableOpacity>
              {cancelling ? (
                <ActivityIndicator size="small" color={theme.error} />
              ) : (
                <TouchableOpacity
                  onPress={() => void handleCancel()}
                  accessibilityRole="button"
                  accessibilityLabel="Confirmer l'annulation du trajet"
                >
                  <Text variant="bodySmall" color={theme.error} style={styles.confirmCancel}>
                    Oui, annuler
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
