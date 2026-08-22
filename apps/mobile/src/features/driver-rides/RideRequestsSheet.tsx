import { useState } from 'react';
import { View, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { BottomSheet, Badge, Button, Text, Avatar, Icon, EmptyState, useAppTheme, spacing, radii, haptics } from '@vaya/design-system';
import {
  useListRequestsForRideQuery,
  useAcceptBookingMutation,
  useDeclineBookingMutation,
  type Booking,
} from '../../state/api';
import { trackEvent } from '../../services/analytics/analytics';

interface RideRequestsSheetProps {
  visible: boolean;
  rideId: string;
  onClose: () => void;
  /** Tapping an already-accepted request — opens the driver's per-booking
   *  detail view (message/cancel/report no-show). Pending requests have
   *  their own Accepter/Refuser buttons instead; nothing to "manage" yet on
   *  a request that hasn't been accepted. */
  onManageBooking?: (booking: Booking) => void;
}

const REQUEST_BADGE: Record<Booking['status'], { label: string; variant: 'default' | 'success' | 'warning' | 'error' }> = {
  pending: { label: 'En attente', variant: 'warning' },
  accepted: { label: 'Confirmé', variant: 'success' },
  declined: { label: 'Refusé', variant: 'error' },
  cancelled_by_rider: { label: 'Annulé', variant: 'default' },
  cancelled_by_driver: { label: 'Annulé', variant: 'error' },
  expired: { label: 'Expiré', variant: 'default' },
  completed: { label: 'Terminé', variant: 'default' },
  no_show: { label: 'Absence', variant: 'error' },
};

/**
 * The driver's per-ride request list — the real backing of the dashboard
 * hero card's "Demandes" action (stitch my-rides-driver-dashboard). Backed
 * by GET /rides/:id/requests (driver-scoped server-side) whose rows now
 * carry the rider's {fullName, avatarUrl} so the driver can see WHO is
 * asking before accepting — trust before commitment. Accept/decline reuse
 * Phase 1's atomic mutations untouched.
 */
export function RideRequestsSheet({
  visible,
  rideId,
  onClose,
  onManageBooking,
}: RideRequestsSheetProps): React.JSX.Element {
  const theme = useAppTheme().colors;
  const [actionError, setActionError] = useState<string | null>(null);
  const { data: requests, isLoading, isError, refetch } = useListRequestsForRideQuery(rideId, {
    skip: !visible || !rideId,
  });
  const [acceptBooking, acceptState] = useAcceptBookingMutation();
  const [declineBooking, declineState] = useDeclineBookingMutation();

  const pending = (requests ?? []).filter((request) => request.status === 'pending');
  const answered = (requests ?? []).filter((request) => request.status !== 'pending');

  async function respond(
    bookingId: string,
    action: 'accept' | 'decline',
    fire: (bookingId: string) => Promise<unknown>,
  ): Promise<void> {
    setActionError(null);
    try {
      await fire(bookingId);
      haptics.success();
      trackEvent('driver_request_response', { action });
    } catch {
      haptics.error();
      setActionError(
        action === 'accept'
          ? "Impossible d'accepter cette demande pour le moment."
          : 'Impossible de refuser cette demande pour le moment.',
      );
    }
  }

  return (
    <BottomSheet
      visible={visible}
      onClose={onClose}
      title="Demandes de réservation"
      heightRatio={0.62}
      theme={theme}
    >
      <View style={styles.content}>
        {isLoading ? (
          <ActivityIndicator size="small" color={theme.accent} style={styles.loading} />
        ) : isError ? (
          <EmptyState
            icon={<Icon name="cloud-offline-outline" size="lg" color={theme.inkFaint} />}
            title="Impossible de charger les demandes"
            description="Vérifiez votre connexion puis réessayez."
            actionLabel="Réessayer"
            onAction={() => void refetch()}
          />
        ) : (requests?.length ?? 0) === 0 ? (
          <EmptyState
            icon={<Icon name="mail-outline" size="lg" color={theme.inkFaint} />}
            title="Aucune demande"
            description="Les demandes de réservation pour ce trajet apparaîtront ici."
          />
        ) : (
          <View style={styles.list}>
            {pending.length > 0 ? (
              <>
                <Text variant="label" color={theme.inkMuted} style={styles.sectionLabel}>
                  À répondre ({pending.length})
                </Text>
                {pending.map((request) => (
                  <View key={request.id} style={[styles.requestRow, { backgroundColor: theme.surfaceMuted }]}>
                    <View style={styles.identityCol}>
                      <Avatar uri={request.rider?.avatarUrl} name={request.rider?.fullName ?? '?'} sizePx={40} />
                      <View style={styles.identityText}>
                        <Text variant="body" color={theme.ink} numberOfLines={1} style={styles.riderName}>
                          {request.rider?.fullName ?? 'Passager'}
                        </Text>
                        <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
                          {`${request.seatsRequested} place${request.seatsRequested > 1 ? 's' : ''} · ${request.pickupLabel}`}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.actions}>
                      <Button
                        label="Refuser"
                        size="sm"
                        variant="outline"
                        disabled={declineState.isLoading}
                        onPress={() => void respond(request.id, 'decline', declineBooking)}
                        style={styles.actionButton}
                      />
                      <Button
                        label="Accepter"
                        size="sm"
                        disabled={acceptState.isLoading}
                        onPress={() => void respond(request.id, 'accept', acceptBooking)}
                        style={styles.actionButton}
                      />
                    </View>
                  </View>
                ))}
              </>
            ) : (
              <Text variant="bodySmall" color={theme.inkMuted} style={styles.allAnswered}>
                Toutes les demandes ont été traitées.
              </Text>
            )}

            {answered.length > 0 ? (
              <>
                <Text variant="label" color={theme.inkMuted} style={[styles.sectionLabel, styles.answeredLabel]}>
                  Déjà traitées
                </Text>
                {answered.map((request) => {
                  const badge = REQUEST_BADGE[request.status];
                  const manageable = request.status === 'accepted' && Boolean(onManageBooking);
                  return (
                    <TouchableOpacity
                      key={request.id}
                      style={styles.answeredRow}
                      disabled={!manageable}
                      onPress={manageable ? () => onManageBooking!(request) : undefined}
                      accessibilityRole={manageable ? 'button' : 'text'}
                      accessibilityLabel={
                        manageable
                          ? `Gérer la réservation de ${request.rider?.fullName ?? 'ce passager'}`
                          : undefined
                      }
                    >
                      <Avatar uri={request.rider?.avatarUrl} name={request.rider?.fullName ?? '?'} sizePx={36} />
                      <View style={styles.identityText}>
                        <Text variant="bodySmall" color={theme.ink} numberOfLines={1}>
                          {request.rider?.fullName ?? 'Passager'}
                        </Text>
                        <Text variant="caption" color={theme.inkMuted}>
                          {`${request.seatsRequested} place${request.seatsRequested > 1 ? 's' : ''}`}
                        </Text>
                      </View>
                      <Badge label={badge.label} variant={badge.variant} />
                      {manageable ? (
                        <Icon name="chevron-forward" size="xs" color={theme.outline} />
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : null}

            {actionError ? (
              <Text variant="bodySmall" color={theme.error} style={styles.actionError}>
                {actionError}
              </Text>
            ) : null}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}

const styles = StyleSheet.create({
  content: {
    flex: 1,
  },
  loading: {
    marginTop: spacing.lg,
  },
  list: {
    gap: spacing.sm,
  },
  sectionLabel: {
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    marginTop: spacing.xs,
  },
  answeredLabel: {
    marginTop: spacing.md,
  },
  requestRow: {
    borderRadius: radii.xl,
    padding: spacing.md,
    gap: spacing.sm,
  },
  identityCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  identityText: {
    flex: 1,
    gap: 1,
  },
  riderName: {
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  actionButton: {
    flex: 1,
  },
  allAnswered: {
    textAlign: 'center',
    paddingVertical: spacing.sm,
  },
  answeredRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xs,
  },
  actionError: {
    textAlign: 'center',
    paddingTop: spacing.sm,
  },
});
