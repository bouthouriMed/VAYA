import { useEffect, useState } from 'react';
import { View, StyleSheet, TouchableOpacity } from 'react-native';
import { BottomSheet, Button, Avatar, Icon, Text, useAppTheme, spacing, radii, haptics } from '@vaya/design-system';
import { router } from 'expo-router';
import type { Booking } from '../../state/api';
import { CancellationSheet } from '../bookings/CancellationSheet';
import { NoShowReportSheet } from '../bookings/NoShowReportSheet';

interface DriverBookingDetailSheetProps {
  visible: boolean;
  booking: Booking | null;
  onClose: () => void;
}

/**
 * The driver-side counterpart to a rider's booking screens
 * (bookings/pending|pickup|live.tsx) — closes the gap Phases 7-10's notes
 * repeatedly flagged: every message/cancel/no-show entry point existed only
 * on the rider side because there was nowhere on the driver side to put the
 * equivalent affordance. Reached by tapping an accepted request in
 * RideRequestsSheet's "Déjà traitées" list. Reuses CancellationSheet and
 * NoShowReportSheet as-is (both already `role`-aware, just never passed
 * `role="driver"` from any real screen before this) and the same
 * conversations/[bookingId].tsx screen the rider side already uses — one
 * conversation per booking, not per role, so there's nothing driver-specific
 * to build there.
 */
export function DriverBookingDetailSheet({
  visible,
  booking,
  onClose,
}: DriverBookingDetailSheetProps): React.JSX.Element {
  const theme = useAppTheme().colors;
  const [cancelling, setCancelling] = useState(false);
  const [reportingNoShow, setReportingNoShow] = useState(false);

  useEffect(() => {
    if (!visible) {
      setCancelling(false);
      setReportingNoShow(false);
    }
  }, [visible]);

  if (!booking) {
    return (
      <BottomSheet visible={false} onClose={onClose} theme={theme}>
        {null}
      </BottomSheet>
    );
  }

  function openConversation(): void {
    haptics.selection();
    onClose();
    router.push(`/conversations/${booking!.id}`);
  }

  return (
    <>
      <BottomSheet
        visible={visible && !cancelling && !reportingNoShow}
        onClose={onClose}
        title={booking.rider?.fullName ?? 'Passager'}
        heightRatio={0.5}
        theme={theme}
      >
        <View style={styles.content}>
          <View style={styles.identityRow}>
            <Avatar uri={booking.rider?.avatarUrl} name={booking.rider?.fullName ?? '?'} sizePx={48} />
            <View style={styles.identityText}>
              <Text variant="body" color={theme.ink} style={styles.riderName} numberOfLines={1}>
                {booking.rider?.fullName ?? 'Passager'}
              </Text>
              <Text variant="caption" color={theme.inkMuted} numberOfLines={1}>
                {`${booking.seatsRequested} place${booking.seatsRequested > 1 ? 's' : ''} · ${booking.contributionTotal} DT`}
              </Text>
            </View>
          </View>

          <View style={[styles.factRow, { backgroundColor: theme.surfaceMuted }]}>
            <Icon name="location-outline" size="sm" color={theme.inkMuted} />
            <Text variant="bodySmall" color={theme.ink} numberOfLines={2} style={styles.factText}>
              {booking.pickupLabel}
            </Text>
          </View>

          <Button
            label="Message"
            theme={theme}
            onPress={openConversation}
            style={styles.actionButton}
          />
          <Button
            label="Signaler une absence"
            variant="outline"
            theme={theme}
            onPress={() => setReportingNoShow(true)}
            style={styles.actionButton}
          />
          <TouchableOpacity
            onPress={() => setCancelling(true)}
            accessibilityRole="button"
            accessibilityLabel="Annuler cette réservation"
          >
            <Text variant="body" color={theme.error} style={styles.cancelLabel}>
              Annuler cette réservation
            </Text>
          </TouchableOpacity>
        </View>
      </BottomSheet>

      <CancellationSheet
        visible={cancelling}
        bookingId={booking.id}
        role="driver"
        onClose={() => setCancelling(false)}
        onCancelled={onClose}
      />
      <NoShowReportSheet
        visible={reportingNoShow}
        bookingId={booking.id}
        role="driver"
        counterpartName={booking.rider?.fullName}
        onClose={() => setReportingNoShow(false)}
        onReported={onClose}
      />
    </>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
    paddingBottom: spacing.xl,
  },
  identityRow: {
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
  factRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
    borderRadius: radii.xl,
    padding: spacing.md,
  },
  factText: {
    flex: 1,
  },
  actionButton: {
    width: '100%',
  },
  cancelLabel: {
    textAlign: 'center',
    paddingVertical: spacing.sm,
    fontWeight: '600',
  },
});
